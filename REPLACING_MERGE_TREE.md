# ReplacingMergeTree Implementation for Automatic Deduplication

## Overview

This document describes the implementation of ReplacingMergeTree table engine for automatic deduplication of Data Vault Hub tables in ClickHouse.

## Problem Statement

Despite implementing SQL-level deduplication mechanisms (DISTINCT + WHERE NOT IN), duplicate records were still appearing in Hub tables when multiple DataPackages were loaded in parallel. This occurred due to race conditions where:

1. Multiple load tasks check for existing records simultaneously
2. Both see that records don't exist (neither has inserted yet)
3. Both insert the same records → duplicates created

## Solution: ReplacingMergeTree

ReplacingMergeTree is a specialized ClickHouse table engine that automatically removes duplicate rows during background merge operations.

### Key Features

1. **Automatic Deduplication**: Removes duplicates during merge operations
2. **Version Column**: Uses a version column to determine which duplicate to keep
3. **Distributed Compatible**: Works with ReplicatedReplacingMergeTree for clusters
4. **No Application Logic**: Deduplication handled by database engine
5. **Eventually Consistent**: Duplicates removed during merges (can force with OPTIMIZE)

## Implementation Details

### Table Engine Changes

#### Single Node Mode

**Before**:
```sql
CREATE TABLE hub_customer (
    customer_hash_key String,
    load_datetime DateTime64(3),
    record_source String,
    ...
)
ENGINE = MergeTree()
ORDER BY (customer_hash_key)
```

**After**:
```sql
CREATE TABLE hub_customer (
    customer_hash_key String,
    load_datetime DateTime64(3),
    record_source String,
    ...
)
ENGINE = ReplacingMergeTree(load_datetime)
ORDER BY (customer_hash_key)
```

**Changes**:
- Engine: `MergeTree()` → `ReplacingMergeTree(load_datetime)`
- Version column: `load_datetime` (keeps row with highest timestamp)

#### Cluster Mode

**Before**:
```sql
-- Local table on each node
CREATE TABLE hub_customer_local ON CLUSTER 'my_cluster' (
    ...
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/default/hub_customer_local', '{replica}')
ORDER BY (customer_hash_key)
```

**After**:
```sql
-- Local table on each node
CREATE TABLE hub_customer_local ON CLUSTER 'my_cluster' (
    ...
)
ENGINE = ReplicatedReplacingMergeTree('/clickhouse/tables/{shard}/default/hub_customer_local', '{replica}', load_datetime)
ORDER BY (customer_hash_key)
```

**Changes**:
- Engine: `ReplicatedMergeTree()` → `ReplicatedReplacingMergeTree()`
- Added third parameter: `load_datetime` (version column)
- Distributed table unchanged (uses Distributed engine)

### Version Column: load_datetime

The `load_datetime` column is used as the version column:

**Purpose**: Determines which duplicate row to keep
**Type**: `DateTime64(3)` (millisecond precision)
**Logic**: ClickHouse keeps the row with the **highest** version value
**Value**: Set to `now64(3)` during INSERT (current timestamp with milliseconds)

**Example**:
```
Row 1: hash_key=ABC, load_datetime=2024-01-01 10:00:00.000
Row 2: hash_key=ABC, load_datetime=2024-01-01 10:00:00.500
Row 3: hash_key=ABC, load_datetime=2024-01-01 10:01:00.000

After deduplication:
→ Keeps Row 3 (latest load_datetime)
```

### Optimization Function

Added `optimize_table_for_deduplication()` function in `clickhouse_utils.py`:

```python
def optimize_table_for_deduplication(model: 'Model', backend: 'StorageBackend'):
    """
    Run OPTIMIZE TABLE FINAL to trigger deduplication.
    
    Forces ReplacingMergeTree to merge all parts and remove duplicates.
    """
    # For cluster mode
    OPTIMIZE TABLE {database}.{table_name}_local ON CLUSTER '{cluster_name}' FINAL
    
    # For single mode
    OPTIMIZE TABLE {database}.{table_name} FINAL
```

**What OPTIMIZE FINAL does**:
1. Forces merge of ALL table parts
2. Triggers deduplication logic in ReplacingMergeTree
3. Removes duplicate rows based on ORDER BY key
4. Keeps row with highest version column value
5. Blocks until complete (synchronous operation)

### Celery Task

Added `optimize_model_table_task` in `tasks.py`:

```python
@shared_task(bind=True, name="core.optimize_model_table_task")
def optimize_model_table_task(self, model_id):
    """
    Trigger table optimization after all data loads complete.
    """
    model = Model.objects.select_related("clickhouse_backend").get(id=model_id)
    optimize_table_for_deduplication(model, model.clickhouse_backend)
```

**Purpose**: Coordinate optimization after all package loads finish

### Celery Chord Coordination

Modified `load_data()` endpoint in `views.py` to use Celery chord:

```python
from celery import chord

# Create task signatures for all package loads
task_signatures = []
for package in data_packages:
    task_sig = load_data_package_task.si(model_id, package.id, run.id)
    task_signatures.append(task_sig)

# Execute all loads in parallel, then optimize when all complete
optimize_callback = optimize_model_table_task.si(model_id)
chord(task_signatures)(optimize_callback)
```

**How Celery chord works**:
1. **Header tasks**: All load_data_package_task executions (run in parallel)
2. **Callback task**: optimize_model_table_task (runs after ALL header tasks complete)
3. **Coordination**: Celery automatically manages task completion tracking
4. **Failure handling**: Callback only runs if all header tasks succeed

## Data Flow

### Complete Loading Flow

```
User clicks "Load Data"
    ↓
Create Run for each DataPackage
    ↓
Create task signatures (not executed yet)
    ↓
Execute chord(all_loads)(optimize_callback)
    ↓
┌─────────────────────────────────┐
│  All Load Tasks Execute         │
│  (in parallel)                  │
├─────────────────────────────────┤
│ Package 1 → INSERT with dups    │
│ Package 2 → INSERT with dups    │
│ Package 3 → INSERT with dups    │
│ ...                             │
└─────────────────────────────────┘
    ↓
All tasks complete successfully
    ↓
Celery triggers callback
    ↓
optimize_model_table_task executes
    ↓
OPTIMIZE TABLE ... FINAL
    ↓
Merge all parts
    ↓
Remove duplicates (keep latest by load_datetime)
    ↓
Final deduplicated table ✓
```

### Deduplication Example

**Initial State**: Empty table

**Package 1 Load** (10:00:00):
```sql
INSERT INTO hub_customer
SELECT 'ABC' as customer_hash_key, now64(3) as load_datetime, ...
-- Creates Part 1
```

**Package 2 Load** (10:00:01, parallel, same data):
```sql
INSERT INTO hub_customer
SELECT 'ABC' as customer_hash_key, now64(3) as load_datetime, ...
-- Creates Part 2 (duplicate!)
```

**Table State After Loads**:
```
Part 1: customer_hash_key=ABC, load_datetime=2024-01-01 10:00:00.123
Part 2: customer_hash_key=ABC, load_datetime=2024-01-01 10:00:01.456
```

**OPTIMIZE FINAL Execution**:
```sql
OPTIMIZE TABLE hub_customer FINAL
```

**Final State**:
```
customer_hash_key=ABC, load_datetime=2024-01-01 10:00:01.456
(Latest version kept, duplicate removed)
```

## Benefits

### 1. Race-Condition Safe

**Problem**: Parallel loads with SQL-level checks still create duplicates
**Solution**: ReplacingMergeTree handles duplicates at engine level, after all loads

### 2. Automatic Deduplication

**Problem**: Manual deduplication requires complex application logic
**Solution**: ClickHouse engine handles it automatically during merges

### 3. Keeps Latest Data

**Problem**: Need to decide which duplicate to keep
**Solution**: Version column (load_datetime) ensures latest data is retained

### 4. Cluster Compatible

**Problem**: Deduplication must work across distributed cluster
**Solution**: ReplicatedReplacingMergeTree provides both replication and deduplication

### 5. Parallel Loading

**Problem**: Serializing loads for safety is slow
**Solution**: Load in parallel, deduplicate after all complete

### 6. No Manual Intervention

**Problem**: Users need to remember to run cleanup
**Solution**: Automatic optimization via Celery chord callback

## Performance Considerations

### OPTIMIZE FINAL Impact

**Operation**: Merges all table parts into single part
**Duration**: Depends on table size and cluster
**CPU/Memory**: Intensive operation
**I/O**: High disk I/O during merge
**Blocking**: Blocks on same table, other queries can run

**Recommendations**:
- Run during low-traffic periods if possible
- Monitor resource usage
- For very large tables, consider scheduled optimization

### Background Merges

ReplacingMergeTree also performs background merges:

**Automatic**: ClickHouse merges parts in background
**Gradual**: Duplicates removed gradually
**No Blocking**: Non-intrusive
**Eventually Consistent**: All duplicates eventually removed

**Note**: OPTIMIZE FINAL forces immediate, complete deduplication

## Monitoring

### Check for Duplicates

```sql
-- Count duplicates in table
SELECT 
    customer_hash_key,
    count(*) as cnt
FROM hub_customer
GROUP BY customer_hash_key
HAVING cnt > 1
```

### Check Table Parts

```sql
-- See how many parts exist (more parts = potential duplicates)
SELECT 
    table,
    count(*) as parts,
    sum(rows) as total_rows
FROM system.parts
WHERE table = 'hub_customer_local' AND active = 1
GROUP BY table
```

### Monitor Optimization Progress

```sql
-- Check if OPTIMIZE is running
SELECT 
    query,
    elapsed,
    read_rows,
    memory_usage
FROM system.processes
WHERE query LIKE '%OPTIMIZE%'
```

## Migration Guide

### For Existing Tables

If you have existing Hub tables with the old engine:

**Option 1: Recreate Table** (Recommended for small tables)
```sql
-- 1. Backup data
CREATE TABLE hub_customer_backup AS hub_customer

-- 2. Drop old table
DROP TABLE hub_customer

-- 3. Create new table with ReplacingMergeTree
CREATE TABLE hub_customer (...)
ENGINE = ReplacingMergeTree(load_datetime)
ORDER BY (customer_hash_key)

-- 4. Restore data
INSERT INTO hub_customer SELECT * FROM hub_customer_backup

-- 5. Optimize
OPTIMIZE TABLE hub_customer FINAL
```

**Option 2: Alter Engine** (For large tables, if supported)
```sql
-- May not be supported for all ClickHouse versions
ALTER TABLE hub_customer 
MODIFY ENGINE ReplacingMergeTree(load_datetime)
```

### For Cluster Tables

```sql
-- 1. Drop existing tables
DROP TABLE hub_customer ON CLUSTER 'my_cluster'
DROP TABLE hub_customer_local ON CLUSTER 'my_cluster'

-- 2. Recreate with new engine (done automatically by application)
-- Use "Create Table" button in UI
```

## Troubleshooting

### Duplicates Still Exist

**Cause**: OPTIMIZE FINAL hasn't been run yet
**Solution**: Manually run optimization
```sql
OPTIMIZE TABLE hub_customer FINAL
```

### OPTIMIZE Takes Too Long

**Cause**: Very large table with many parts
**Solution**: 
- Wait for background merges to reduce parts first
- Schedule OPTIMIZE during low-traffic periods
- Increase ClickHouse resources

### Optimization Fails

**Cause**: Insufficient disk space or memory
**Solution**:
- Free up disk space
- Increase ClickHouse memory limits
- Try with smaller batches

### Wrong Version Kept

**Cause**: Version column (load_datetime) not set correctly
**Solution**: Ensure all INSERTs set load_datetime properly
```sql
INSERT INTO hub_customer
SELECT 
    MD5(customer_id) as customer_hash_key,
    now64(3) as load_datetime,  -- Must be present!
    ...
```

## Best Practices

### 1. Always Use Version Column

Ensure `load_datetime` is populated for all rows:
```sql
-- Correct
SELECT now64(3) as load_datetime

-- Incorrect (would use null or default)
SELECT NULL as load_datetime
```

### 2. Run OPTIMIZE After Batch Loads

After loading multiple packages, always trigger optimization:
- Automatically via chord callback (current implementation)
- Manually if needed

### 3. Monitor Duplicate Count

Periodically check for duplicates:
```sql
SELECT count(*) FROM (
    SELECT customer_hash_key, count(*) as cnt
    FROM hub_customer
    GROUP BY customer_hash_key
    HAVING cnt > 1
)
```

### 4. Schedule Periodic OPTIMIZE

For tables with frequent updates:
```sql
-- Run nightly or weekly
OPTIMIZE TABLE hub_customer FINAL
```

### 5. Use Correct ORDER BY

Ensure ORDER BY includes the deduplication key:
```sql
-- Correct
ORDER BY (customer_hash_key)

-- Incorrect (would not deduplicate properly)
ORDER BY (load_datetime)
```

## Future Enhancements

### 1. Configurable Version Column

Allow users to choose version column:
- Current: Always uses `load_datetime`
- Future: Allow selection (e.g., `updated_at`, `version_number`)

### 2. Scheduled Optimization

Add periodic background optimization:
- Celery beat task
- Configurable schedule (daily, weekly)
- Per-table or global

### 3. Optimization Progress Tracking

Show optimization progress in UI:
- Run status: "Optimizing table..."
- Progress percentage
- Estimated time remaining

### 4. Smart Optimization

Only optimize when needed:
- Track duplicate count
- Optimize only if count > threshold
- Skip if recently optimized

### 5. Partition-Level Optimization

For very large tables:
- Optimize specific partitions
- Incremental optimization
- Lower resource impact

## References

### ClickHouse Documentation

- [ReplacingMergeTree](https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/replacingmergetree)
- [ReplicatedReplacingMergeTree](https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/replication)
- [OPTIMIZE Query](https://clickhouse.com/docs/en/sql-reference/statements/optimize)

### Related Files

- `backend/core/clickhouse_utils.py` - Table creation and optimization functions
- `backend/core/tasks.py` - Celery tasks for loading and optimization
- `backend/core/views.py` - API endpoints using chord coordination

## Summary

ReplacingMergeTree provides robust, automatic deduplication for Data Vault Hub tables:

✅ **Automatic**: Engine-level deduplication
✅ **Race-Safe**: Handles parallel load duplicates
✅ **Latest Data**: Keeps most recent version
✅ **Cluster-Ready**: Works with ReplicatedReplacingMergeTree
✅ **Coordinated**: Celery chord triggers optimization after all loads
✅ **Production-Ready**: Comprehensive error handling and logging

The implementation eliminates duplicate records while maintaining high performance and allowing parallel data loading operations.
