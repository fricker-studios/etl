# Preventing Duplicates from Parallel Data Loading

## Problem Statement

When the "Load Data" button is clicked for a Data Model, the system queues multiple Celery tasks to load data from different DataPackages in parallel. This parallel execution creates a race condition that causes duplicate records in Hub tables.

### The Race Condition

```
Timeline of Parallel Execution:

Time 1: Task A (Package 1) starts
        → Checks: Is record X in hub_customer? No
        
Time 2: Task B (Package 2) starts
        → Checks: Is record X in hub_customer? No (Task A hasn't inserted yet!)
        
Time 3: Task A completes
        → Inserts: record X into hub_customer
        
Time 4: Task B completes
        → Inserts: record X into hub_customer (DUPLICATE!)
```

### Why the Original Deduplication Wasn't Enough

The original implementation used this SQL:

```sql
INSERT INTO db.hub_customer
SELECT ...
FROM s3('file.parquet')
WHERE MD5(toString(customer_id)) NOT IN (
    SELECT customer_hash_key FROM db.hub_customer
)
```

This works perfectly for **serial** execution but fails with **parallel** execution because:

1. **Check-Then-Act Race Condition**: The check (`WHERE NOT IN`) and action (`INSERT`) are not atomic when performed by multiple concurrent tasks
2. **Time Window**: There's a time window between the check and insert where another task can insert the same record
3. **Independent Operations**: Each Celery task operates independently without coordination

## Solution Architecture

We implemented a **two-layer defense** strategy:

### Layer 1: Distributed Locking (Primary Defense)

Uses Django's cache as a distributed lock to serialize data loading operations per model.

**Key Features**:
- **Per-Model Granularity**: Each model has its own lock (model_123, model_456, etc.)
- **Parallel Models**: Different models can load simultaneously
- **Atomic Acquisition**: Uses `cache.add()` for atomic lock operations
- **Automatic Cleanup**: Lock released even if task fails
- **Graceful Waiting**: Exponential backoff for blocked tasks

### Layer 2: SQL DISTINCT (Secondary Defense)

Adds `SELECT DISTINCT` to eliminate duplicates within the source data.

**Key Features**:
- **Within-Batch Deduplication**: Handles duplicates in a single load
- **Efficient**: ClickHouse optimizes DISTINCT operations
- **Complementary**: Works alongside lock mechanism

## Implementation Details

### Distributed Lock Implementation

```python
@shared_task(bind=True, name="core.load_data_package_task")
def load_data_package_task(self, model_id, data_package_id, run_id=None):
    # Create a unique lock key per model
    lock_key = f"load_data_lock_model_{model_id}"
    lock_timeout = 3600  # 1 hour max
    
    # Try to acquire lock with exponential backoff
    max_wait_time = 300  # 5 minutes
    wait_time = 1
    total_waited = 0
    
    while total_waited < max_wait_time:
        # Atomic operation: add only if key doesn't exist
        if cache.add(lock_key, self.request.id, timeout=lock_timeout):
            # Lock acquired! Perform data load
            try:
                return _perform_data_load(model_id, data_package_id, run_id)
            finally:
                # Always release lock
                cache.delete(lock_key)
        
        # Lock held by another task, wait with exponential backoff
        time.sleep(wait_time)
        total_waited += wait_time
        wait_time = min(wait_time * 2, 30)  # 1s, 2s, 4s, 8s, ... max 30s
    
    # Timeout: couldn't acquire lock
    raise TimeoutError("Lock acquisition timeout")
```

### SQL DISTINCT Implementation

```sql
-- Hub tables with deduplication
INSERT INTO db.hub_customer
SELECT DISTINCT  -- ← Added DISTINCT
    MD5(toString(customer_id)) as customer_hash_key,
    now64(3) as load_datetime,
    'package1.parquet' as record_source,
    customer_id,
    customer_name
FROM s3('s3://bucket/package1.parquet')
WHERE MD5(toString(customer_id)) NOT IN (
    SELECT customer_hash_key FROM db.hub_customer
)
```

## How It Prevents Duplicates

### Scenario 1: Two Tasks, Different Records

```
Time 1: Task A acquires lock for model_123
Time 2: Task B tries lock, blocks, waits 1s
Time 3: Task A loads records {X, Y, Z}
Time 4: Task A releases lock
Time 5: Task B acquires lock
Time 6: Task B loads records {A, B, C}
Time 7: Task B releases lock

Result: All records loaded, no duplicates
```

### Scenario 2: Two Tasks, Overlapping Records

```
Time 1: Task A acquires lock for model_123
Time 2: Task B tries lock, blocks, waits 1s
Time 3: Task A loads records {X, Y, Z} with DISTINCT
Time 4: Task A releases lock
Time 5: Task B acquires lock
Time 6: Task B checks: X, Y, Z already exist (WHERE NOT IN)
Time 7: Task B loads only new records {A, B}
Time 8: Task B releases lock

Result: No duplicates (X, Y, Z loaded once)
```

### Scenario 3: Same Record in Multiple Files

```
File 1: customer_id = 123 (appears 3 times)
File 2: customer_id = 123 (appears 2 times)

Task A (File 1):
- DISTINCT reduces 3 occurrences to 1
- Inserts customer_id = 123 once

Task B (File 2):
- Waits for Task A to complete
- WHERE NOT IN filters out customer_id = 123
- Inserts nothing (already exists)

Result: customer_id = 123 appears exactly once
```

## Lock Behavior Details

### Lock Key Format

```python
lock_key = f"load_data_lock_model_{model_id}"
# Examples:
# "load_data_lock_model_123"
# "load_data_lock_model_456"
```

### Lock Lifecycle

1. **Acquisition**: `cache.add(key, value, timeout)` - atomic operation
2. **Holding**: Lock held during entire data load operation
3. **Release**: `cache.delete(key)` - in finally block, always executes
4. **Timeout**: Lock auto-expires after 1 hour (safety mechanism)

### Exponential Backoff

```python
Wait times: 1s, 2s, 4s, 8s, 16s, 30s, 30s, 30s, ...
Max wait: 5 minutes total
```

**Why Exponential**:
- Quick retry for short operations (1-2s)
- Reduces load for long operations (caps at 30s)
- Prevents thundering herd problem

### Lock Timeout Scenarios

**Normal Operation** (lock released):
```
Task A: Acquires lock → Loads data (30s) → Releases lock
Task B: Waits 1s → Waits 2s → Acquires lock → Loads data
```

**Failure Scenario** (lock released via finally):
```
Task A: Acquires lock → Loads data → ERROR → finally: Releases lock
Task B: Waits → Acquires lock → Loads data successfully
```

**Timeout Scenario** (lock acquisition fails):
```
Task A: Acquires lock → Long operation (>5 minutes)
Task B: Waits 1s, 2s, 4s, ... 30s × 10 = 5 min → TIMEOUT
Task B: Fails with TimeoutError, run marked as failed
```

## Cache Backend Requirements

### Recommended for Production

**Redis**:
```python
# settings.py
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': 'redis://127.0.0.1:6379/1',
    }
}
```

**Memcached**:
```python
# settings.py
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.memcached.PyMemcacheCache',
        'LOCATION': '127.0.0.1:11211',
    }
}
```

### Development/Single Server

**Database Cache**:
```python
# settings.py
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.db.DatabaseCache',
        'LOCATION': 'cache_table',
    }
}
```

**Local Memory** (single process only):
```python
# settings.py
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
    }
}
```

## Performance Characteristics

### Best Case (No Contention)

```
Single load: 0ms overhead (lock acquired immediately)
Time = data_load_time + ~1ms (cache operations)
```

### Typical Case (Some Contention)

```
First task: 0ms wait
Second task: 1-2s wait (first task completes quickly)
Third task: 1-2s wait (second task completes quickly)

Total = sum(data_load_times) + small_waits
```

### Worst Case (High Contention)

```
10 tasks for same model:
Task 1: 0s wait, loads (30s)
Task 2: 30s wait, loads (30s)
Task 3: 60s wait, loads (30s)
...
Task 10: 270s wait, loads (30s)

Total = 10 × 30s = 300s (serialized)
```

### Optimal Case (Different Models)

```
Task A (Model 1): 0s wait, loads parallel
Task B (Model 2): 0s wait, loads parallel
Task C (Model 3): 0s wait, loads parallel

Total = max(load_times) (fully parallel)
```

## Monitoring and Troubleshooting

### Log Messages

**Lock Acquired**:
```
INFO: Loading data package 123 into model 456 (Run ID: 789)
```

**Lock Waiting**:
```
INFO: Model 456 is locked by another loading task, waiting 1s...
INFO: Model 456 is locked by another loading task, waiting 2s...
INFO: Model 456 is locked by another loading task, waiting 4s...
```

**Lock Timeout**:
```
ERROR: Could not acquire lock for model 456 after 300s
```

### Checking Active Locks

```python
from django.core.cache import cache

# Check if model is locked
model_id = 123
lock_key = f"load_data_lock_model_{model_id}"
is_locked = cache.get(lock_key) is not None

print(f"Model {model_id} locked: {is_locked}")
```

### Manually Releasing Locks

```python
from django.core.cache import cache

# Force release lock (use with caution!)
model_id = 123
lock_key = f"load_data_lock_model_{model_id}"
cache.delete(lock_key)
print(f"Lock released for model {model_id}")
```

### Cache Statistics

**Redis**:
```bash
redis-cli
> KEYS load_data_lock_*
> TTL load_data_lock_model_123
```

**Memcached**:
```bash
echo "stats" | nc localhost 11211
```

## Testing

### Test Case 1: Serial Loading (No Race)

```python
def test_serial_loading():
    """Test that serial loading works correctly."""
    model = create_test_model()
    package1 = create_test_package()
    package2 = create_test_package()
    
    # Load sequentially
    load_data_package_task(model.id, package1.id)
    load_data_package_task(model.id, package2.id)
    
    # Verify no duplicates
    count = get_hub_record_count(model)
    assert count == expected_unique_records
```

### Test Case 2: Parallel Loading (With Race)

```python
def test_parallel_loading():
    """Test that parallel loading prevents duplicates."""
    model = create_test_model()
    package1 = create_test_package()  # Contains overlapping data
    package2 = create_test_package()  # Contains overlapping data
    
    # Load in parallel
    task1 = load_data_package_task.delay(model.id, package1.id)
    task2 = load_data_package_task.delay(model.id, package2.id)
    
    # Wait for completion
    task1.get()
    task2.get()
    
    # Verify no duplicates
    count = get_hub_record_count(model)
    assert count == expected_unique_records
    
    # Verify both runs succeeded
    assert Run.objects.filter(model=model, status="success").count() == 2
```

### Test Case 3: Lock Timeout

```python
def test_lock_timeout():
    """Test that lock timeout is handled gracefully."""
    model = create_test_model()
    package = create_test_package()
    
    # Simulate stuck lock
    lock_key = f"load_data_lock_model_{model.id}"
    cache.set(lock_key, "stuck_task", timeout=3600)
    
    # Try to load (should timeout)
    with pytest.raises(TimeoutError):
        load_data_package_task(model.id, package.id)
    
    # Verify run marked as failed
    run = Run.objects.filter(model=model).first()
    assert run.status == "failed"
    assert "timeout" in run.error_message.lower()
```

## Migration Notes

### Existing Deployments

**No data migration needed**:
- Existing data remains unchanged
- New loading respects existing records via `WHERE NOT IN`
- Works with all existing Hub tables

**Cache setup required**:
- Ensure Django cache is configured
- Redis/Memcached recommended for production
- Works with any cache backend

### Cleaning Existing Duplicates

If duplicates exist before this fix:

```sql
-- Option 1: Keep first occurrence (by load_datetime)
CREATE TABLE hub_customer_clean ENGINE = MergeTree() ORDER BY (customer_hash_key) AS
SELECT * FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY customer_hash_key ORDER BY load_datetime) as rn
    FROM hub_customer
) WHERE rn = 1;

DROP TABLE hub_customer;
RENAME TABLE hub_customer_clean TO hub_customer;

-- Option 2: Use OPTIMIZE with ReplacingMergeTree (if table engine supports it)
OPTIMIZE TABLE hub_customer FINAL;
```

## Future Enhancements

### Possible Improvements

1. **Cluster-Aware Locking**: Use cluster name in lock key for multi-cluster setups
2. **Lock Queue Visibility**: Show waiting tasks in UI
3. **Priority Queuing**: Allow high-priority loads to skip queue
4. **Partial Retry**: Retry only failed packages instead of all
5. **Load Deduplication**: Skip packages already successfully loaded
6. **Configurable Timeouts**: Make lock timeout configurable per model
7. **Metrics**: Track lock wait times and contention

### Alternative Approaches Considered

**ReplacingMergeTree**:
- Pros: Automatic deduplication at merge time
- Cons: Eventually consistent, not immediate

**Distributed Locks (Celery)**:
- Pros: Native Celery integration
- Cons: Requires Redis backend for Celery

**Task Serialization (Queue)**:
- Pros: No lock management needed
- Cons: Complex routing, limits parallelism

**Chosen: Cache-based locks**:
- ✅ Simple implementation
- ✅ Works with any cache backend
- ✅ Immediate consistency
- ✅ Automatic cleanup
- ✅ Per-model granularity

## References

- [Django Cache Framework](https://docs.djangoproject.com/en/stable/topics/cache/)
- [Celery Task Best Practices](https://docs.celeryproject.org/en/stable/userguide/tasks.html)
- [ClickHouse INSERT Performance](https://clickhouse.com/docs/en/sql-reference/statements/insert-into/)
- [Distributed Locking Patterns](https://redis.io/topics/distlock)

## Change History

| Date | Version | Description |
|------|---------|-------------|
| 2024-02-14 | 1.0 | Initial implementation of parallel loading protection |
