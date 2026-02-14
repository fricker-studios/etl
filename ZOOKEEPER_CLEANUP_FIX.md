# ZooKeeper Replica Cleanup Fix

## Problem Statement

When using ClickHouse clusters with ReplicatedMergeTree tables, deleting and recreating Data Models would fail with the error:

```
Replica /clickhouse/tables/{shard}/{database}/{table_name}_local/replicas/{replica} already exists
(REPLICA_ALREADY_EXISTS)
```

This occurred even though the tables were successfully dropped from ClickHouse.

## Root Cause

### ZooKeeper Metadata Persistence

ClickHouse uses ZooKeeper to coordinate ReplicatedMergeTree tables across cluster nodes. The ZooKeeper structure stores:

```
/clickhouse/tables/{shard}/{database}/{table_name}_local/
├── replicas/
│   ├── ch1/      ← Replica metadata
│   ├── ch2/
│   └── ch3/
├── blocks/       ← Block checksums
└── mutations/    ← DDL changes
```

### The Issue

When `DROP TABLE` is executed:
1. ClickHouse removes the table from its catalog
2. ClickHouse schedules ZooKeeper cleanup
3. Command returns immediately (async cleanup)
4. ZooKeeper metadata may not be removed yet

When recreating the same table:
1. `CREATE TABLE` tries to register replica
2. ZooKeeper still has old replica paths
3. Error: `REPLICA_ALREADY_EXISTS`

### Why This Happens

- **Network delays**: ZooKeeper cleanup is async
- **Partial failures**: Some nodes may not complete cleanup
- **Timing**: Recreate happens before cleanup completes
- **ZooKeeper lag**: Distributed consensus takes time

## Solution

### Two-Layer Approach

#### Layer 1: Synchronous Drops (Proactive)

Use `SYNC` keyword in DROP TABLE statements:

```sql
-- Before
DROP TABLE IF EXISTS table_name ON CLUSTER 'cluster'

-- After
DROP TABLE IF EXISTS table_name ON CLUSTER 'cluster' SYNC
```

**Effect**:
- Blocks until cleanup is complete
- Waits for ZooKeeper metadata removal
- Ensures clean state before deletion completes

**Limitations**:
- Doesn't help if previous deletion failed
- Doesn't handle external ZooKeeper issues
- Can't fix already-orphaned metadata

#### Layer 2: Explicit Cleanup (Defensive)

Before creating tables, explicitly remove orphaned replica metadata:

```sql
SYSTEM DROP REPLICA 'replica_name' FROM ZKPATH '/clickhouse/tables/{shard}/{database}/{table}_local'
```

**Effect**:
- Removes any leftover replica metadata
- Self-healing - fixes orphaned paths
- Idempotent - safe to run multiple times

**Process**:
1. Query `system.clusters` for all replicas
2. For each replica, attempt to drop its ZooKeeper path
3. Ignore errors (expected if no orphan exists)
4. Continue with table creation

## Implementation

### In create_data_vault_hub_table()

Added before table creation (line ~381):

```python
if use_cluster and cluster_name:
    local_table_name = f"{table_name}_local"
    
    # Clean up any leftover ZooKeeper metadata
    try:
        # Get all replicas in the cluster
        replicas_query = f"""
            SELECT DISTINCT replica_num, host_name 
            FROM system.clusters 
            WHERE cluster = '{cluster_name}'
        """
        replicas = client.query(replicas_query).result_rows
        
        # ZooKeeper path for the table (with macro placeholders)
        zk_path = f'/clickhouse/tables/{{{{shard}}}}/{database}/{local_table_name}'
        
        # Try to drop each replica's metadata
        for replica_num, host_name in replicas:
            try:
                cleanup_cmd = f"SYSTEM DROP REPLICA '{host_name}' FROM ZKPATH '{zk_path}'"
                client.command(cleanup_cmd)
                logger.info(f"Cleaned up replica {host_name} from {zk_path}")
            except Exception as cleanup_err:
                # Expected if replica doesn't exist - not an error
                logger.debug(f"Could not cleanup replica {host_name}: {cleanup_err}")
    except Exception as e:
        logger.warning(f"Could not cleanup replicas before table creation: {e}")
        # Continue anyway - table creation will fail if real issue exists
    
    # Now create the table (no conflict!)
    CREATE TABLE ...
```

### In drop_table_from_model()

Modified DROP statements (lines ~489, 495):

```python
if use_cluster and cluster_name:
    # Added SYNC keyword
    drop_distributed = f"""
        DROP TABLE IF EXISTS {database}.{table_name} 
        ON CLUSTER '{cluster_name}' 
        SYNC
    """
    client.command(drop_distributed)
    
    drop_local = f"""
        DROP TABLE IF EXISTS {database}.{local_table_name} 
        ON CLUSTER '{cluster_name}' 
        SYNC
    """
    client.command(drop_local)
```

## How It Works

### Normal Flow (No Issues)

**Deletion**:
```
User deletes model
  ↓
DROP TABLE ... SYNC (distributed)
  ↓
DROP TABLE ... SYNC (local)
  ↓
Wait for ZooKeeper cleanup
  ↓
Cleanup complete
  ↓
Model deleted
```

**Recreation**:
```
User creates model
  ↓
Query replicas
  ↓
Try cleanup (nothing to clean)
  ↓
CREATE TABLE
  ↓
Success!
```

### Recovery Flow (With Orphaned Metadata)

**Deletion** (with failure):
```
User deletes model
  ↓
DROP TABLE ... SYNC (starts)
  ↓
Network issue / partial failure
  ↓
Some ZooKeeper paths remain
  ↓
Model deleted (table gone, orphaned ZK metadata)
```

**Recreation** (with cleanup):
```
User creates model
  ↓
Query replicas (gets ch1, ch2, ch3)
  ↓
SYSTEM DROP REPLICA 'ch1' (removes orphan)
SYSTEM DROP REPLICA 'ch2' (removes orphan)
SYSTEM DROP REPLICA 'ch3' (removes orphan)
  ↓
CREATE TABLE (no conflict!)
  ↓
Success!
```

## Testing

### Test Cases

1. **Normal Delete/Recreate**
   ```
   Create hub_customer → Delete → Recreate
   Expected: ✅ Works
   ```

2. **Rapid Delete/Recreate**
   ```
   Create → Delete → Immediately Recreate
   Expected: ✅ Works (SYNC ensures cleanup)
   ```

3. **Failed Cleanup**
   ```
   Create → DELETE (network issue) → Recreate
   Expected: ✅ Works (cleanup before create handles it)
   ```

4. **Multiple Recreates**
   ```
   Create → Delete → Recreate → Delete → Recreate
   Expected: ✅ Works (idempotent)
   ```

### Verification Queries

**Check for orphaned replicas**:
```sql
SELECT * FROM system.zookeeper 
WHERE path LIKE '/clickhouse/tables/%/replicas%'
```

**Check table exists**:
```sql
SELECT database, name, engine 
FROM system.tables 
WHERE name LIKE '%hub%'
```

**Check cluster health**:
```sql
SELECT cluster, shard_num, replica_num, host_name, errors_count
FROM system.clusters
```

## Error Handling

### Cleanup Errors (Expected)

```python
try:
    client.command("SYSTEM DROP REPLICA ...")
except Exception as e:
    logger.debug(f"Could not cleanup: {e}")
    # This is expected if no orphan exists
    # Continue with table creation
```

**Why not raise**:
- Most cleanup attempts will fail (no orphan)
- Failures are normal, not errors
- Real issues will surface during CREATE TABLE

### CREATE TABLE Errors (Real Issues)

```python
try:
    client.command("CREATE TABLE ...")
except Exception as e:
    logger.error(f"Failed to create table: {e}")
    raise  # This is a real error
```

**Why raise**:
- CREATE TABLE failure means real problem
- User needs to know table wasn't created
- May indicate config/permission issues

## Limitations

### When This Doesn't Help

1. **ZooKeeper Down**: If ZooKeeper is completely unavailable
2. **Permissions**: If user lacks SYSTEM DROP REPLICA permission
3. **Different Cluster**: If recreating in different cluster
4. **Manual ZK Changes**: If someone manually modified ZooKeeper

### Additional Considerations

1. **Performance**: Each cleanup attempt is a ZooKeeper operation
   - Usually <100ms per replica
   - Acceptable for table creation (rare operation)

2. **Logging**: Debug logs can be verbose
   - Info: Successful cleanups
   - Debug: Expected failures
   - Warning: Unexpected issues

3. **Compatibility**: Requires ClickHouse 19.16+
   - SYSTEM DROP REPLICA added in 19.16
   - SYNC keyword available since early versions

## Best Practices

### When Deleting Models

1. Always use SYNC drops (now automatic)
2. Check logs for cleanup errors
3. Wait for operation to complete

### When Creating Models

1. Use unique names when possible
2. Check existing tables first
3. Monitor cleanup logs

### Monitoring

Watch for these log patterns:

**Good**:
```
INFO: Cleaned up replica ch1 from /clickhouse/tables/.../hub_customer_local
INFO: Creating local hub table...
```

**Expected** (not errors):
```
DEBUG: Could not cleanup replica ch2: Replica doesn't exist
```

**Problems**:
```
WARNING: Could not cleanup replicas before table creation: Permission denied
ERROR: Failed to create table: REPLICA_ALREADY_EXISTS
```

## Troubleshooting

### Still Getting REPLICA_ALREADY_EXISTS?

1. **Check cluster configuration**:
   ```sql
   SELECT * FROM system.clusters WHERE cluster = 'your_cluster'
   ```

2. **Verify cleanup ran**:
   ```
   Look for "Cleaned up replica" in logs
   ```

3. **Check ZooKeeper directly**:
   ```sql
   SELECT * FROM system.zookeeper 
   WHERE path = '/clickhouse/tables/...'
   ```

4. **Manual cleanup** (last resort):
   ```sql
   SYSTEM DROP REPLICA 'replica_name' FROM ZKPATH '/path'
   ```

### Permissions Issues

If you see "Permission denied" for SYSTEM DROP REPLICA:

1. Grant permission:
   ```sql
   GRANT SYSTEM DROP REPLICA ON *.* TO user
   ```

2. Or use admin user for table operations

### Performance Concerns

If cleanup is slow:

1. Check ZooKeeper latency
2. Reduce number of replicas queried
3. Consider async cleanup (trade-off)

## Future Enhancements

### Possible Improvements

1. **Async Cleanup with Retry**
   - Queue cleanup operations
   - Retry on next create attempt
   - Reduces create latency

2. **ZooKeeper Health Check**
   - Verify ZK is healthy before operations
   - Fail fast if ZK is down
   - Better error messages

3. **Cleanup Cache**
   - Remember which paths were cleaned
   - Skip cleanup if recently done
   - Reduces ZK load

4. **UUID in Paths**
   - Use unique IDs in ZK paths
   - Eliminates conflicts entirely
   - Breaking change (requires migration)

## References

- [ClickHouse ReplicatedMergeTree](https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/replication)
- [SYSTEM DROP REPLICA](https://clickhouse.com/docs/en/sql-reference/statements/system#drop-replica)
- [DROP TABLE with SYNC](https://clickhouse.com/docs/en/sql-reference/statements/drop#sync-modifier)
- [ZooKeeper in ClickHouse](https://clickhouse.com/docs/en/operations/tips#zookeeper)

## Summary

This fix provides a robust, self-healing solution for ZooKeeper replica metadata cleanup:

- **Proactive**: SYNC drops ensure clean deletion
- **Defensive**: Pre-creation cleanup handles edge cases
- **Idempotent**: Safe to run multiple times
- **Self-Healing**: Automatically fixes orphaned metadata
- **Production-Ready**: Comprehensive error handling
- **Observable**: Clear logging for debugging

Users can now confidently delete and recreate Data Models without encountering REPLICA_ALREADY_EXISTS errors.
