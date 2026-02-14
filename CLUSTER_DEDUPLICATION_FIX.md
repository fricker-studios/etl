# Cluster Deduplication Fix

## Overview

This document explains the critical fix for duplicate data in ClickHouse cluster deployments and provides verification steps.

## Problem Statement

When using ReplacingMergeTree tables in a ClickHouse cluster, duplicates persisted even after running `OPTIMIZE TABLE FINAL` on all nodes. The duplication rate was approximately 2x (meaning each unique record appeared twice on average).

### Symptoms

1. `OPTIMIZE` appeared to only run on one node (though it was using `ON CLUSTER`)
2. After manual `OPTIMIZE` on all nodes, duplicates dropped from 5x to 2x
3. Duplicates still existed even after proper optimization

## Root Cause

The issue was **random sharding** in the Distributed table definition.

### Broken Configuration

```sql
CREATE TABLE db.hub_customer ON CLUSTER 'my_cluster' AS db.hub_customer_local
ENGINE = Distributed('my_cluster', db, hub_customer_local, rand());
                                                          ^^^^^^
                                                          PROBLEM!
```

### How Random Sharding Caused Duplicates

1. **Random Distribution**: The `rand()` sharding key means each INSERT is randomly assigned to a shard
2. **Same Key, Different Shards**: The same `hash_key` value can end up on multiple shards
3. **Limited Deduplication**: ReplacingMergeTree only deduplicates WITHIN a shard, not across shards
4. **Result**: Duplicates persist across shards

### Example Timeline

```
Time 1: INSERT hash_key='ABC' → rand()=123 → routes to Shard 1
Time 2: INSERT hash_key='ABC' → rand()=456 → routes to Shard 2
Time 3: INSERT hash_key='ABC' → rand()=789 → routes to Shard 1

After OPTIMIZE on all nodes:
  Shard 1: 1 row with hash_key='ABC' (merged local duplicates)
  Shard 2: 1 row with hash_key='ABC' (merged local duplicates)
  
Total: 2 rows with hash_key='ABC' ❌ DUPLICATES ACROSS SHARDS!
```

## Solution: Hash-Based Sharding

### Correct Configuration

```sql
CREATE TABLE db.hub_customer ON CLUSTER 'my_cluster' AS db.hub_customer_local
ENGINE = Distributed('my_cluster', db, hub_customer_local, sipHash64(customer_hash_key));
                                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                                          SOLUTION!
```

### How Hash-Based Sharding Prevents Duplicates

1. **Deterministic Distribution**: `sipHash64(hash_key)` always produces the same hash for the same key
2. **Same Key, Same Shard**: The same `hash_key` value ALWAYS routes to the same shard
3. **Complete Deduplication**: ReplacingMergeTree can deduplicate all instances of a key
4. **Result**: Zero duplicates after OPTIMIZE

### Example Timeline

```
Time 1: INSERT hash_key='ABC' → sipHash64('ABC')=123 → routes to Shard 1
Time 2: INSERT hash_key='ABC' → sipHash64('ABC')=123 → routes to Shard 1
Time 3: INSERT hash_key='ABC' → sipHash64('ABC')=123 → routes to Shard 1

After OPTIMIZE on all nodes:
  Shard 1: 1 row with hash_key='ABC' (merged all duplicates)
  Shard 2: 0 rows with hash_key='ABC'
  
Total: 1 row with hash_key='ABC' ✅ NO DUPLICATES!
```

## Verification Steps

### Step 1: Check Sharding Key

Run this query to verify your table uses hash-based sharding:

```sql
SELECT 
    name,
    engine,
    engine_full,
    sharding_key
FROM system.tables
WHERE database = 'default' AND name = 'hub_customer';
```

**Expected Result**:
```
┌─name───────────┬─engine──────┬─engine_full─────────────────────────────────────────┬─sharding_key────────────────────┐
│ hub_customer   │ Distributed │ Distributed('my_cluster', default, hub_customer... │ sipHash64(customer_hash_key)    │
└────────────────┴─────────────┴─────────────────────────────────────────────────────┴─────────────────────────────────┘
```

**Bad Result (needs fix)**:
```
┌─sharding_key─┐
│ rand()       │  ❌ WRONG! Will cause duplicates
└──────────────┘
```

### Step 2: Check for Duplicates

Run this query on the LOCAL table to check for duplicates:

```sql
SELECT 
    hostName() as host,
    hash_key,
    count() as duplicate_count
FROM hub_customer_local
GROUP BY host, hash_key
HAVING count() > 1
ORDER BY duplicate_count DESC
LIMIT 100;
```

**Good Result** (no duplicates):
```
┌─host─┬─hash_key─┬─duplicate_count─┐
└──────┴──────────┴─────────────────┘
0 rows in set
```

**Bad Result** (has duplicates):
```
┌─host───┬─hash_key───────────┬─duplicate_count─┐
│ ch1    │ abc123def456       │              3   │
│ ch2    │ xyz789uvw012       │              2   │
└────────┴────────────────────┴─────────────────┘
```

### Step 3: Check Data Distribution

Verify data is distributed across shards:

```sql
SELECT 
    hostName() as host,
    count() as row_count,
    count(DISTINCT hash_key) as unique_keys
FROM hub_customer_local
GROUP BY host
ORDER BY host;
```

**Expected Result**:
```
┌─host───┬─row_count─┬─unique_keys─┐
│ ch1    │    50000   │      50000   │  ✅ row_count = unique_keys
│ ch2    │    50000   │      50000   │  ✅ row_count = unique_keys
│ ch3    │    50000   │      50000   │  ✅ row_count = unique_keys
└────────┴────────────┴──────────────┘
```

**Bad Result** (duplicates):
```
┌─host───┬─row_count─┬─unique_keys─┐
│ ch1    │    50000   │      25000   │  ❌ row_count > unique_keys
│ ch2    │    50000   │      25000   │  ❌ indicates duplicates
│ ch3    │    50000   │      25000   │  ❌ indicates duplicates
└────────┴────────────┴──────────────┘
```

### Step 4: Verify OPTIMIZE Execution

Check that OPTIMIZE has run and merged parts:

```sql
SELECT 
    hostName() as host,
    count() as num_parts,
    sum(rows) as total_rows,
    formatReadableSize(sum(bytes_on_disk)) as disk_size
FROM system.parts
WHERE database = 'default' 
    AND table = 'hub_customer_local'
    AND active
GROUP BY host
ORDER BY host;
```

**Good Result** (few parts = well merged):
```
┌─host───┬─num_parts─┬─total_rows─┬─disk_size────┐
│ ch1    │         2 │     50000  │ 5.23 MiB     │  ✅ Low part count
│ ch2    │         2 │     50000  │ 5.19 MiB     │  ✅ Well optimized
│ ch3    │         1 │     50000  │ 5.21 MiB     │  ✅ Fully merged
└────────┴───────────┴────────────┴──────────────┘
```

**Bad Result** (many parts = needs OPTIMIZE):
```
┌─host───┬─num_parts─┬─total_rows─┬─disk_size────┐
│ ch1    │       156 │     50000  │ 12.43 MiB    │  ❌ Too many parts
│ ch2    │       203 │     50000  │ 13.19 MiB    │  ❌ Not optimized
│ ch3    │       187 │     50000  │ 12.89 MiB    │  ❌ Needs merge
└────────┴───────────┴────────────┴──────────────┘
```

### Step 5: Use API Verification Endpoint

The system provides an API endpoint that generates all verification queries:

```bash
GET /api/models/{model_id}/verification_queries/
```

Response:
```json
{
  "model_name": "hub_customer",
  "table_name": "hub_customer",
  "database": "default",
  "queries": {
    "sharding_key": {
      "description": "Verify sharding key (should be sipHash64 of hash_key, not rand())",
      "sql": "SELECT engine_full, sharding_key FROM system.tables..."
    },
    "duplicates_check": {
      "description": "Check for duplicate hash keys (should be 0 after OPTIMIZE)",
      "sql": "SELECT hash_key, count() ... HAVING count() > 1"
    },
    "data_distribution": {
      "description": "Check how data is distributed across shards",
      "sql": "SELECT hostName(), count() FROM table GROUP BY hostName()"
    },
    "parts_status": {
      "description": "Check merge status of table parts on each node",
      "sql": "SELECT hostName(), count() as num_parts... FROM system.parts"
    }
  }
}
```

## Migration Guide

If you have an existing table with `rand()` sharding that has duplicates:

### Option A: Recreate Table (Recommended)

This is the cleanest approach:

1. **Delete the Data Model**
   - In the UI, delete the model
   - This drops both distributed and local tables
   - ZooKeeper metadata is cleaned up

2. **Recreate the Data Model**
   - Create a new model with the same name
   - Click "Create Table"
   - The new table will use `sipHash64()` sharding

3. **Reload Data**
   - Click "Load Data"
   - All packages will be reloaded
   - OPTIMIZE runs automatically after loading
   - No duplicates!

### Option B: Manual Fix (Advanced)

If you want to keep existing data:

1. **Drop only the distributed table**
   ```sql
   DROP TABLE IF EXISTS default.hub_customer ON CLUSTER 'my_cluster';
   ```

2. **Recreate with correct sharding**
   ```sql
   CREATE TABLE default.hub_customer ON CLUSTER 'my_cluster' 
   AS default.hub_customer_local
   ENGINE = Distributed('my_cluster', default, hub_customer_local, sipHash64(customer_hash_key));
   ```

3. **Run OPTIMIZE to remove duplicates**
   ```sql
   OPTIMIZE TABLE default.hub_customer_local ON CLUSTER 'my_cluster' FINAL;
   ```

4. **Verify no duplicates**
   ```sql
   SELECT hash_key, count() 
   FROM default.hub_customer_local 
   GROUP BY hash_key 
   HAVING count() > 1;
   ```

**Note**: This approach keeps existing data but duplicates within the same shard will be removed. Cross-shard duplicates from before the fix will remain unless you manually deduplicate them.

### Option C: Full Deduplication (Most Thorough)

For complete cleanup of all duplicates:

1. **Create temporary table with correct sharding**
   ```sql
   CREATE TABLE default.hub_customer_new ON CLUSTER 'my_cluster' 
   AS default.hub_customer_local
   ENGINE = Distributed('my_cluster', default, hub_customer_local_new, sipHash64(customer_hash_key));
   
   CREATE TABLE default.hub_customer_local_new ON CLUSTER 'my_cluster' 
   AS default.hub_customer_local
   ENGINE = ReplicatedReplacingMergeTree('/clickhouse/tables/{shard}/default/hub_customer_local_new', '{replica}', load_datetime)
   ORDER BY (customer_hash_key);
   ```

2. **Copy data with deduplication**
   ```sql
   INSERT INTO default.hub_customer_local_new
   SELECT * FROM (
       SELECT *
       FROM default.hub_customer_local
       ORDER BY load_datetime DESC
   )
   GROUP BY customer_hash_key;
   ```

3. **Rename tables**
   ```sql
   RENAME TABLE default.hub_customer TO default.hub_customer_old ON CLUSTER 'my_cluster';
   RENAME TABLE default.hub_customer_local TO default.hub_customer_local_old ON CLUSTER 'my_cluster';
   
   RENAME TABLE default.hub_customer_new TO default.hub_customer ON CLUSTER 'my_cluster';
   RENAME TABLE default.hub_customer_local_new TO default.hub_customer_local ON CLUSTER 'my_cluster';
   ```

4. **Drop old tables**
   ```sql
   DROP TABLE default.hub_customer_old ON CLUSTER 'my_cluster';
   DROP TABLE default.hub_customer_local_old ON CLUSTER 'my_cluster';
   ```

## Technical Details

### Why sipHash64?

- **Fast**: SipHash is a fast, cryptographically secure hash function
- **Even Distribution**: Produces uniform distribution across shards
- **Deterministic**: Same input always produces same output
- **ClickHouse Optimized**: Built-in function, highly optimized

### Alternative Hash Functions

You could also use:
- `cityHash64()`: Slightly faster but less secure
- `murmurHash3_64()`: Another fast hash function
- `xxHash64()`: Very fast, good distribution

**Recommendation**: Stick with `sipHash64()` unless you have specific performance requirements.

### ReplacingMergeTree Behavior

**How it works**:
1. Multiple inserts create multiple data parts
2. Background merges combine parts
3. During merge, duplicate rows (same ORDER BY key) are identified
4. The row with the highest version column value is kept
5. Other rows are discarded

**Version Column**: In our case, `load_datetime`
- Higher timestamp = more recent = kept
- Lower timestamp = older = discarded

**OPTIMIZE FINAL**:
- Forces immediate merge of all parts
- Triggers deduplication immediately
- Without it, deduplication happens gradually via background merges

## Best Practices

### 1. Always Use Hash-Based Sharding

For any table where deduplication matters:
```sql
ENGINE = Distributed('cluster', db, table, sipHash64(primary_key))
```

### 2. Run OPTIMIZE After Bulk Loads

After loading large amounts of data:
```sql
OPTIMIZE TABLE table_name ON CLUSTER 'cluster' FINAL;
```

### 3. Monitor Part Count

Too many parts = poor query performance:
```sql
SELECT count() FROM system.parts 
WHERE database='db' AND table='table' AND active;
```

If count > 100, run OPTIMIZE.

### 4. Use Verification Queries

Regularly check for duplicates:
```sql
SELECT hash_key, count() 
FROM table 
GROUP BY hash_key 
HAVING count() > 1;
```

### 5. Test in Development First

Before changing production:
1. Test sharding change in dev/staging
2. Verify deduplication works
3. Measure query performance
4. Then apply to production

## Troubleshooting

### Problem: Duplicates Still Exist After OPTIMIZE

**Check**:
1. Is sharding key using sipHash64? (not rand())
2. Did OPTIMIZE run on ALL nodes?
3. Are you querying the distributed table or local table?

**Solution**:
```sql
-- Check sharding key
SELECT sharding_key FROM system.tables WHERE name='table_name';

-- Run OPTIMIZE on all nodes
OPTIMIZE TABLE table_local ON CLUSTER 'cluster' FINAL;

-- Query via distributed table
SELECT * FROM table_name;  -- not table_name_local
```

### Problem: OPTIMIZE Takes Too Long

**Check**:
```sql
SELECT count() as num_parts 
FROM system.parts 
WHERE table='table_name' AND active;
```

**Solution**:
If > 1000 parts, increase server resources or run OPTIMIZE more frequently.

### Problem: Data Skewed Across Shards

**Check**:
```sql
SELECT hostName(), count() 
FROM table_local 
GROUP BY hostName();
```

**Solution**:
If one shard has much more data, verify:
1. Sharding key is correct
2. Hash function distributes evenly
3. No manual INSERT INTO local tables

## Performance Impact

### Hash-Based Sharding vs Random

**Query Performance**:
- Hash-based: Same or better (data locality)
- Random: Can be worse (data scattered)

**Write Performance**:
- Hash-based: Same (hash computation negligible)
- Random: Same

**Deduplication**:
- Hash-based: Perfect (100% effective)
- Random: Poor (only within-shard)

**Disk Usage**:
- Hash-based: Lower (no duplicates)
- Random: Higher (duplicates persist)

## Summary

### The Fix

Changed from:
```sql
ENGINE = Distributed('cluster', db, table_local, rand())
```

To:
```sql
ENGINE = Distributed('cluster', db, table_local, sipHash64(hash_key))
```

### Impact

- **Before**: 2-5x duplicates even after OPTIMIZE
- **After**: 0 duplicates guaranteed

### Migration

- **Easiest**: Delete and recreate table
- **Advanced**: Manual table recreation
- **Thorough**: Full data deduplication

### Verification

Use the `/api/models/{id}/verification_queries/` endpoint or run queries manually.

## References

- [ClickHouse ReplacingMergeTree Documentation](https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/replacingmergetree)
- [ClickHouse Distributed Table Engine](https://clickhouse.com/docs/en/engines/table-engines/special/distributed)
- [ClickHouse Hash Functions](https://clickhouse.com/docs/en/sql-reference/functions/hash-functions)
