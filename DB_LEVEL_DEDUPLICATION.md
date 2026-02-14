# Database-Level Duplicate Prevention Using ClickHouse Native Features

## Solution Overview

Instead of application-level locking, we use ClickHouse's built-in deduplication mechanisms to handle race conditions at the database level. This is simpler, faster, and more reliable.

## Implementation

### ClickHouse INSERT Settings

```python
client.command(insert_sql, settings={
    'insert_deduplicate': 1,  # Enable block-level deduplication
    'insert_deduplicate_token': f"{model.id}_{data_package.id}"  # Unique token per load
})
```

### Three-Layer Defense

**Layer 1: Block-Level Deduplication** (`insert_deduplicate=1`)
- ClickHouse computes a hash of each data block being inserted
- Rejects blocks that have already been inserted
- Works automatically across all concurrent INSERTs

**Layer 2: Token-Based Deduplication** (`insert_deduplicate_token`)
- Unique token per model + data package combination
- Prevents same package from being loaded twice
- Format: `{model_id}_{data_package_id}` (e.g., `"123_456"`)

**Layer 3: SQL DISTINCT + WHERE NOT IN**
- `SELECT DISTINCT` eliminates duplicates within source data
- `WHERE NOT IN` excludes records that already exist in table
- Handles overlapping data across different packages

## How It Works

### Block Deduplication Mechanism

ClickHouse maintains a hash table of recently inserted blocks:

```
INSERT block with hash ABC123
→ ClickHouse checks: Is ABC123 in hash table?
→ No: Accept insert, add ABC123 to hash table
→ Yes: Reject insert (duplicate block)
```

Hash table is maintained per table and automatically cleaned up.

### Token Deduplication Mechanism

When a token is provided, ClickHouse associates it with the block hash:

```
INSERT with token "123_456" and block hash ABC123
→ ClickHouse records: Token "123_456" → Hash ABC123
→ Future INSERT with same token: Rejected (already inserted)
```

This prevents the same data package from being inserted multiple times.

### Complete SQL Example

```sql
-- Generated SQL with deduplication
INSERT INTO default.hub_customer
SELECT DISTINCT
    MD5(toString(customer_id)) as customer_hash_key,
    now64(3) as load_datetime,
    'package1.parquet' as record_source,
    customer_id,
    customer_name
FROM s3('s3://bucket/package1.parquet', ...)
WHERE MD5(toString(customer_id)) NOT IN (
    SELECT customer_hash_key FROM default.hub_customer
)
SETTINGS 
    insert_deduplicate = 1,
    insert_deduplicate_token = '123_456'
```

## Race Condition Handling

### Scenario: Two Tasks, Same Data

```
Time 1: Task A starts INSERT with token "123_456"
Time 2: Task B starts INSERT with token "123_456" (parallel)
Time 3: Task A completes, ClickHouse records hash + token
Time 4: Task B evaluated by ClickHouse
        → Token "123_456" already exists
        → Block rejected
Time 5: Task B completes (0 rows inserted)

Result: No duplicates!
```

### Scenario: Two Tasks, Different Packages

```
Time 1: Task A starts INSERT with token "123_456"
Time 2: Task B starts INSERT with token "123_789" (different package)
Time 3: Both tasks execute in parallel
Time 4: ClickHouse evaluates both:
        → Task A: New records X, Y, Z inserted
        → Task B: WHERE NOT IN filters X, Y, Z
        → Task B: Only new records A, B inserted

Result: No duplicates, both succeed!
```

### Scenario: Exact Same Block, Different Tokens

```
File 1: Contains customer_id = 123
File 2: Contains customer_id = 123 (exact same data)

Task A: INSERT with token "model_123_package_456"
        → Block hash: ABC999
        → Inserts successfully
        
Task B: INSERT with token "model_123_package_789"
        → Block hash: ABC999 (same!)
        → WHERE NOT IN filters customer_id = 123
        → Nothing to insert (already exists)

Result: No duplicates!
```

## Advantages Over Application-Level Locking

### Code Simplicity

**Before (Application Lock)**:
- ~100 lines of locking code
- Lock acquisition/release
- Exponential backoff
- Timeout handling
- Error recovery

**After (Database Level)**:
- ~5 lines of settings
- No lock management
- No waiting logic
- Built into database

### Performance

**Before**: Serialized execution
```
Task 1: 30s (loads)
Task 2: 30s (waits + loads)
Task 3: 30s (waits + loads)
Total: 90s
```

**After**: Parallel execution
```
Task 1: 30s (loads) ┐
Task 2: 30s (loads) ├→ Parallel
Task 3: 30s (loads) ┘
Total: ~30-35s (ClickHouse handles atomicity)
```

### Reliability

**Application Lock**:
- Requires cache backend (Redis/Memcached)
- Cache failures break locking
- Network issues can cause deadlocks
- Manual lock cleanup needed

**Database Level**:
- Built into ClickHouse (no dependencies)
- Database handles all edge cases
- Automatic cleanup
- Battle-tested mechanism

### Dependencies

**Application Lock**:
- Django cache framework
- Redis or Memcached server
- Network connectivity
- Cache configuration

**Database Level**:
- Nothing! Built into ClickHouse

## Configuration

### ClickHouse Settings

These settings are passed directly to the INSERT command:

```python
settings = {
    'insert_deduplicate': 1,  # Enable deduplication (default: 1)
    'insert_deduplicate_token': 'unique_identifier'  # Optional token
}
```

### Server-Level Configuration (Optional)

Can be configured in ClickHouse's `config.xml`:

```xml
<clickhouse>
    <insert_deduplicate>1</insert_deduplicate>
    <!-- How long to keep deduplication info -->
    <replicated_deduplication_window>100</replicated_deduplication_window>
    <replicated_deduplication_window_seconds>604800</replicated_deduplication_window_seconds>
</clickhouse>
```

Default values work well for most use cases.

## Monitoring

### Check Deduplication Activity

```sql
-- View recent insertions (including deduplicated ones)
SELECT 
    database,
    table,
    partition_id,
    block_number,
    rows,
    is_deleted
FROM system.parts
WHERE table = 'hub_customer'
ORDER BY modification_time DESC
LIMIT 10;
```

### Check for Duplicates

```sql
-- Verify no duplicates exist
SELECT 
    customer_hash_key,
    count(*) as cnt
FROM hub_customer
GROUP BY customer_hash_key
HAVING cnt > 1;
```

Should return 0 rows if deduplication works correctly.

### View Deduplication Info (Replicated Tables)

```sql
SELECT 
    database,
    table,
    zookeeper_name,
    zookeeper_path,
    create_time,
    block_numbers
FROM system.replicated_deduplicate_log
WHERE table LIKE '%hub%'
ORDER BY create_time DESC
LIMIT 10;
```

## Edge Cases

### Case 1: Retrying Failed Load

```
First attempt: INSERT fails (network error)
                → ClickHouse may have partial data
                → Block hash recorded
                
Retry: INSERT with same token
       → ClickHouse rejects (token exists)
       → Prevents double insertion

Solution: Use different token for retry, or use WHERE NOT IN to filter
```

### Case 2: ClickHouse Restart

```
Before restart: Block hashes in memory
After restart: Hash table cleared
Same INSERT again: Accepted (hash forgotten)

Solution: WHERE NOT IN still prevents duplicates
          Tokens may be stored persistently (replicated tables)
```

### Case 3: Very Large Blocks

```
Block size: 10 million rows
Block hash: Computed on entire block
Duplicate check: Fast (hash comparison)

Performance: No issue, hash computation is O(1) lookup
```

## Testing

### Test 1: Parallel Loading Same Package

```python
def test_parallel_same_package():
    """Load same package twice in parallel."""
    model_id = 123
    package_id = 456
    
    # Start two tasks simultaneously
    task1 = load_data_package_task.delay(model_id, package_id)
    task2 = load_data_package_task.delay(model_id, package_id)
    
    # Wait for both
    task1.get()
    task2.get()
    
    # Check: Only one should succeed, or second should insert 0 rows
    runs = Run.objects.filter(model_id=model_id, data_package_id=package_id)
    total_rows = sum(r.rows_processed for r in runs)
    
    # Verify no duplicates
    actual_count = get_hub_count(model_id)
    assert actual_count == expected_unique_count
```

### Test 2: Parallel Loading Different Packages

```python
def test_parallel_different_packages():
    """Load different packages with overlapping data in parallel."""
    model_id = 123
    package1_id = 456  # Contains: customer 1, 2, 3
    package2_id = 789  # Contains: customer 2, 3, 4
    
    # Start two tasks simultaneously
    task1 = load_data_package_task.delay(model_id, package1_id)
    task2 = load_data_package_task.delay(model_id, package2_id)
    
    # Wait for both
    task1.get()
    task2.get()
    
    # Check: Should have customers 1, 2, 3, 4 (no duplicates)
    actual_count = get_hub_count(model_id)
    assert actual_count == 4  # Not 6!
```

### Test 3: Retry After Failure

```python
def test_retry_after_failure():
    """Retry loading after a failure."""
    model_id = 123
    package_id = 456
    
    # First attempt (simulated failure)
    with mock.patch('clickhouse_client.command', side_effect=Exception('Network error')):
        with pytest.raises(Exception):
            load_data_package_task(model_id, package_id)
    
    # Retry (should succeed and not duplicate)
    load_data_package_task(model_id, package_id)
    
    # Verify no duplicates
    actual_count = get_hub_count(model_id)
    assert actual_count == expected_unique_count
```

## Performance Tuning

### Block Size

Larger blocks = More efficient deduplication:

```python
# Adjust block size for better performance
settings = {
    'insert_deduplicate': 1,
    'insert_deduplicate_token': token,
    'max_block_size': 1000000,  # 1M rows per block
    'max_insert_block_size': 1000000
}
```

### Deduplication Window

How long to keep deduplication info:

```xml
<!-- Keep info for 7 days or 100 recent blocks -->
<replicated_deduplication_window>100</replicated_deduplication_window>
<replicated_deduplication_window_seconds>604800</replicated_deduplication_window_seconds>
```

## Limitations

### 1. Block-Level Only

Deduplication works at the block level, not row level:
- If blocks are different (different order, different rows), both insert
- Solution: Use DISTINCT + WHERE NOT IN for row-level dedup

### 2. Memory Overhead

ClickHouse keeps hash table in memory:
- Default: Last 100 blocks per table
- Configurable via `replicated_deduplication_window`
- Minimal overhead for typical use cases

### 3. Token Lifetime

Tokens are kept for limited time:
- Default: 7 days
- After expiry, same token can be reused
- Solution: Use current timestamp in token for uniqueness

## Best Practices

### 1. Unique Tokens

Always use unique tokens per attempt:

```python
# Good: Includes model, package, and timestamp
token = f"{model.id}_{package.id}_{int(time.time())}"

# Better: Use run_id if available
token = f"{model.id}_{package.id}_{run.id}"
```

### 2. Combine Strategies

Use all three layers:
- Block deduplication (ClickHouse)
- Token deduplication (ClickHouse)
- SQL DISTINCT + WHERE NOT IN (SQL)

### 3. Monitor

Set up monitoring for:
- Duplicate insertions (should be 0)
- Failed deduplication attempts
- Token reuse

### 4. Test Thoroughly

Test with:
- Parallel loads
- Retries after failures
- Overlapping data
- Same data different times

## Migration from Application Locking

### No Changes Required!

The new implementation is a drop-in replacement:
- No configuration changes
- No data migration
- No cache backend needed
- Just works

### Cleanup (Optional)

Can remove cache configuration if it was only used for locking:

```python
# Can remove if only used for data loading locks
# CACHES = {
#     'default': {
#         'BACKEND': 'django.core.cache.backends.redis.RedisCache',
#         ...
#     }
# }
```

## References

- [ClickHouse INSERT Settings](https://clickhouse.com/docs/en/operations/settings/settings#insert-settings)
- [ClickHouse Deduplication](https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/replication#deduplication-of-replicas)
- [Block-Level Deduplication](https://clickhouse.com/docs/en/operations/settings/settings#settings-insert-deduplicate)

## Change History

| Date | Version | Description |
|------|---------|-------------|
| 2024-02-14 | 2.0 | Simplified to use ClickHouse native deduplication (removed application locks) |
| 2024-02-14 | 1.0 | Initial implementation with application-level locking |
