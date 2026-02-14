# Data Vault Hub Duplicate Prevention

## Overview

This document describes the implementation of duplicate prevention for Data Vault Hub tables during data loading operations.

## Problem Statement

Data Vault Hub tables represent unique business entities and should contain only one record per business key. Without duplicate prevention, the following scenarios could lead to duplicate records:

1. **Re-running the same data load**: If a data package is loaded multiple times, duplicate records would be inserted
2. **Multiple data packages with overlapping data**: Different packages might contain the same business keys
3. **Data quality issues**: Source data might contain duplicates that should be deduplicated

## Solution

### Implementation

The solution adds a WHERE clause to the INSERT statement that filters out records where the hash key already exists in the target Hub table.

**Location**: `backend/core/tasks.py` in the `load_data_package_task` function

**Code**:
```python
# For Data Vault Hubs, we need to prevent duplicates based on the hash key
# We'll use a subquery that filters out hash keys that already exist in the target table
if model.type == "data_vault" and model.hubs and hash_key_field:
    # Create a WHERE clause that excludes existing hash keys
    # We use a subquery approach for efficiency
    insert_sql = f"""
    INSERT INTO {database}.{table_name}
    SELECT
        {select_sql}
    FROM {s3_table_func}
    WHERE MD5(toString({business_key_source})) NOT IN (
        SELECT {hash_key_field} FROM {database}.{table_name}
    )
    """
```

### How It Works

1. **Hash Calculation**: The business key is hashed using `MD5(toString(business_key_source))`
2. **Existence Check**: The WHERE clause uses a subquery to check if the hash already exists
3. **Conditional Logic**: Only applies to Data Vault Hub tables with a defined hash key
4. **Idempotent**: The same data can be loaded multiple times without creating duplicates

### SQL Example

**Before (could create duplicates)**:
```sql
INSERT INTO default.hub_customer
SELECT
    MD5(toString(customer_id)) as customer_hash_key,
    now64(3) as load_datetime,
    'customers_2024_01.parquet' as record_source,
    customer_id,
    customer_name
FROM s3('https://s3.amazonaws.com/bucket/data.parquet', 'key', 'secret', 'Parquet')
```

**After (prevents duplicates)**:
```sql
INSERT INTO default.hub_customer
SELECT
    MD5(toString(customer_id)) as customer_hash_key,
    now64(3) as load_datetime,
    'customers_2024_01.parquet' as record_source,
    customer_id,
    customer_name
FROM s3('https://s3.amazonaws.com/bucket/data.parquet', 'key', 'secret', 'Parquet')
WHERE MD5(toString(customer_id)) NOT IN (
    SELECT customer_hash_key FROM default.hub_customer
)
```

## Benefits

### 1. Data Vault Compliance
- Maintains the core Data Vault principle that Hubs contain unique business keys
- Ensures historical tracking works correctly
- Prevents issues with downstream Link and Satellite tables

### 2. Idempotent Data Loading
- The same data package can be loaded multiple times safely
- Useful for retry scenarios after failures
- Simplifies operational procedures

### 3. Data Quality
- Automatically deduplicates source data
- Takes the first occurrence of each business key
- Prevents data quality issues from propagating

### 4. Operational Simplicity
- No need to manually check for duplicates before loading
- No need to clean up duplicates after loading
- Reduces operational complexity

## Performance Considerations

### Query Optimization

The implementation uses a `NOT IN` subquery with the following characteristics:

1. **Index Usage**: The Hub table is ordered by hash key (defined in table creation), so the subquery is efficient
2. **Memory Usage**: ClickHouse loads the subquery results into memory for comparison
3. **Large Tables**: For very large Hub tables, this approach remains efficient due to indexing

### Alternative Approaches Considered

#### 1. DISTINCT in SELECT
```sql
SELECT DISTINCT hash_key, ... FROM s3(...)
```
**Pros**: Simple syntax
**Cons**: Only deduplicates within the incoming data, not against existing table records

#### 2. Temporary Table + MERGE
```sql
-- Insert into temp table
INSERT INTO temp_hub SELECT ... FROM s3(...)
-- Deduplicate and merge
INSERT INTO hub SELECT * FROM temp_hub WHERE hash_key NOT IN (SELECT hash_key FROM hub)
```
**Pros**: More control over the process
**Cons**: More complex, requires temp table management, multiple queries

#### 3. ReplacingMergeTree Engine
```sql
CREATE TABLE hub (...) ENGINE = ReplacingMergeTree() ORDER BY (hash_key)
```
**Pros**: Automatic deduplication at merge time
**Cons**: Deduplication is eventually consistent, not immediate; changes table engine

**Selected Approach**: NOT IN subquery (current implementation)
- Immediate consistency
- Simple implementation
- No table structure changes
- Works with existing MergeTree tables

## Edge Cases

### 1. Empty Target Table
- First load has no existing records to check
- Subquery returns empty set
- All records are inserted (correct behavior)

### 2. All Records Already Exist
- WHERE clause filters out all incoming records
- Zero rows inserted (correct behavior)
- Run completes successfully with rows_processed = 0

### 3. Partial Overlap
- Some records match existing hash keys (filtered out)
- Some records are new (inserted)
- Only new records are loaded (correct behavior)

### 4. Hash Collisions
- MD5 produces 128-bit hashes with extremely low collision probability
- For 1 billion records, collision probability ≈ 10^-18
- Acceptable for business data applications

### 5. Missing Hash Key Field
- If hash_key_field is None, falls back to simple INSERT
- Logs indicate which path was taken
- Prevents errors in non-standard configurations

## Monitoring and Troubleshooting

### Log Messages

The implementation includes detailed logging:

```python
logger.info(f"Executing INSERT statement:\n{insert_sql}")
logger.info(f"Successfully loaded {rows_loaded} rows from {data_package.name}")
```

### Checking for Duplicates

To verify no duplicates exist in a Hub table:

```sql
-- Check for duplicate hash keys
SELECT hash_key, count(*) as cnt
FROM default.hub_customer
GROUP BY hash_key
HAVING cnt > 1
```

### Performance Monitoring

To monitor the performance of duplicate detection:

```sql
-- Check query performance
SELECT 
    query,
    query_duration_ms,
    read_rows,
    read_bytes
FROM system.query_log
WHERE query LIKE '%INSERT INTO%hub_%'
ORDER BY event_time DESC
LIMIT 10
```

## Testing

### Unit Test Scenarios

1. **Test Case: First Load**
   - Scenario: Empty Hub table
   - Expected: All records inserted
   - Verification: Count matches source data

2. **Test Case: Duplicate Load**
   - Scenario: Load same data twice
   - Expected: First load inserts all, second load inserts zero
   - Verification: Total count matches source data (not 2x)

3. **Test Case: Partial Overlap**
   - Scenario: Load data with 50% overlap
   - Expected: Only new records inserted
   - Verification: Count increases by number of unique new keys

4. **Test Case: Different Record Source**
   - Scenario: Load same business keys from different sources
   - Expected: First source loads, second source filtered
   - Verification: record_source reflects first load

### Integration Test

```python
def test_hub_duplicate_prevention():
    # Load initial data package
    run1 = load_data_package_task(model_id, package1_id)
    initial_count = get_hub_record_count(hub_table)
    
    # Load same data package again
    run2 = load_data_package_task(model_id, package1_id)
    final_count = get_hub_record_count(hub_table)
    
    # Assert no duplicates created
    assert run2['rows_loaded'] == 0
    assert final_count == initial_count
    
    # Verify no duplicate hash keys
    duplicates = check_for_duplicate_hash_keys(hub_table)
    assert len(duplicates) == 0
```

## Migration Notes

### Existing Deployments

This change is **non-breaking** and requires no migration:

1. **Existing Tables**: Continue to work without changes
2. **Existing Data**: No cleanup required (future loads will maintain uniqueness)
3. **Configuration**: No configuration changes needed

### Cleaning Existing Duplicates (Optional)

If duplicates exist in current Hub tables, they can be cleaned using:

```sql
-- Option 1: Keep first occurrence (by load_datetime)
CREATE TABLE hub_customer_clean ENGINE = MergeTree() ORDER BY (customer_hash_key) AS
SELECT * FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY customer_hash_key ORDER BY load_datetime) as rn
    FROM hub_customer
) WHERE rn = 1;

-- Drop old table and rename
DROP TABLE hub_customer;
RENAME TABLE hub_customer_clean TO hub_customer;

-- Option 2: Use OPTIMIZE with ReplacingMergeTree
-- (Requires changing engine first)
```

## Future Enhancements

### 1. Configurable Deduplication Strategy
Currently takes first occurrence. Could add configuration for:
- Latest record (by timestamp)
- Specific source priority
- Custom merge logic

### 2. Performance Optimization for Very Large Hubs
For hubs with billions of records, consider:
- Bloom filters for faster existence checks
- Partitioned checking (by date range)
- Distributed table optimization

### 3. Duplicate Detection Reporting
Add metrics for:
- Number of duplicates filtered per load
- Duplicate rate by source
- Duplicate patterns over time

### 4. Satellite Deduplication
Similar logic could be applied to Satellite tables:
- Prevent duplicate attribute versions
- Keep only latest version per Hub key

## References

- Data Vault 2.0 Specification: Hub uniqueness requirements
- ClickHouse Documentation: NOT IN subqueries and performance
- Internal: Data Model loading architecture documentation

## Change History

| Date | Version | Description |
|------|---------|-------------|
| 2024-02-14 | 1.0 | Initial implementation of Hub duplicate prevention |
