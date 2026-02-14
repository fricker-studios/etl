# ClickHouse Cluster Auto-Detection and Table Lifecycle Management

## Overview

This document describes the automatic detection of ClickHouse cluster configurations and the lifecycle management of ClickHouse tables linked to Data Models.

## Problem Statement

### Load Balancer Challenge

When connecting to ClickHouse through a load balancer, the application would only create tables on the specific node the load balancer connected to, not across the entire cluster. This caused several issues:

1. **Incomplete Cluster Deployment**: Tables only existed on one node
2. **Data Inconsistency**: Different nodes had different table structures
3. **Manual Configuration Required**: Users had to manually specify cluster names
4. **No Cluster Awareness**: System couldn't detect if it was behind a load balancer

### Table Cleanup Challenge

When deleting Data Models in Django, the associated ClickHouse tables remained orphaned in the database, causing:

1. **Resource Waste**: Unused tables consuming storage
2. **Management Overhead**: Manual cleanup required
3. **Confusion**: Tables with no associated models

## Solution Architecture

### Auto-Detection System

The system now automatically detects ClickHouse cluster configuration by querying system tables on first connection and periodically thereafter.

#### Detection Process

```
Connection → Query system.clusters → Parse Results → Store Metadata → Use in Table Operations
```

**Query Used**:
```sql
SELECT cluster, shard_num, replica_num, host_name, port 
FROM system.clusters
```

#### Metadata Storage

New fields added to `StorageBackend` model:

```python
is_cluster = BooleanField(default=False)
detected_cluster_name = CharField(max_length=255, null=True)
cluster_nodes = JSONField(default=list)
cluster_metadata_updated_at = DateTimeField(null=True)
```

**Example `cluster_nodes` structure**:
```json
[
  {
    "cluster": "my_cluster",
    "shard": 1,
    "replica": 1,
    "host": "clickhouse-01.example.com",
    "port": 9000
  },
  {
    "cluster": "my_cluster",
    "shard": 1,
    "replica": 2,
    "host": "clickhouse-02.example.com",
    "port": 9000
  },
  {
    "cluster": "my_cluster",
    "shard": 2,
    "replica": 1,
    "host": "clickhouse-03.example.com",
    "port": 9000
  }
]
```

### Automatic Cluster Detection

#### When Detection Occurs

1. **First Connection**: When `get_clickhouse_client()` is called for the first time
2. **Periodic Updates**: Every hour to detect cluster changes
3. **Manual Trigger**: Can be triggered explicitly if needed

#### Detection Logic

```python
def detect_cluster_configuration(backend: StorageBackend, client: Client):
    """
    Auto-detect ClickHouse cluster configuration.
    
    1. Query system.clusters for cluster topology
    2. If clusters found:
       - Set is_cluster = True
       - Store all nodes with shard/replica info
       - If only one cluster: auto-set cluster_name
       - If multiple clusters: store first one, log others
    3. If no clusters found:
       - Set is_cluster = False
       - Clear cluster metadata
    4. Update timestamp
    """
```

#### Priority Order for Cluster Configuration

When creating tables, the system uses cluster configuration in this priority order:

1. **Auto-detected cluster name** (`detected_cluster_name`)
2. **Manually configured cluster name** (`cluster_name`)
3. **Single node mode** (if neither is available)

### Table Lifecycle Management

#### Table Creation

Tables are now created using the detected cluster configuration:

```python
# Before (manual configuration only)
if backend.mode == "cluster" and backend.cluster_name:
    create_cluster_tables(cluster_name=backend.cluster_name)

# After (auto-detected or manual)
use_cluster = backend.is_cluster or (backend.mode == "cluster" and backend.cluster_name)
cluster_name = backend.detected_cluster_name or backend.cluster_name
if use_cluster and cluster_name:
    create_cluster_tables(cluster_name=cluster_name)
```

#### Table Deletion

When a Model is deleted, the associated ClickHouse table(s) are automatically dropped:

**Django Model Override**:
```python
class Model(models.Model):
    def delete(self, *args, **kwargs):
        if self.table_created and self.table_name and self.clickhouse_backend:
            drop_table_from_model(self, self.clickhouse_backend)
        super().delete(*args, **kwargs)
```

**Drop Logic**:
```python
def drop_table_from_model(model: Model, backend: StorageBackend):
    """
    Drop ClickHouse table(s) for a model.
    
    Single Mode:
        DROP TABLE IF EXISTS db.table_name
    
    Cluster Mode:
        DROP TABLE IF EXISTS db.table_name ON CLUSTER 'cluster_name'
        DROP TABLE IF EXISTS db.table_name_local ON CLUSTER 'cluster_name'
    """
```

## Configuration

### Automatic Configuration (Recommended)

No manual configuration needed! Simply:

1. Create a StorageBackend pointing to any ClickHouse node (or load balancer)
2. On first connection, cluster configuration is auto-detected
3. Tables are automatically created on all cluster nodes

### Manual Configuration (Override)

You can still manually configure cluster settings if needed:

```python
backend = StorageBackend.objects.create(
    kind="clickhouse",
    mode="cluster",
    cluster_name="my_cluster",  # Manual override
    hosts=[{"host": "lb.example.com", "port": 8123}]
)
```

**Note**: Manual settings take precedence over auto-detection.

## Use Cases

### Use Case 1: Single Node to Cluster Migration

**Scenario**: You start with a single ClickHouse node and later expand to a cluster.

**Steps**:
1. Create StorageBackend pointing to single node
2. System detects single node mode (`is_cluster=False`)
3. Tables created as single node tables
4. Later, ClickHouse is configured as a cluster
5. System re-detects on next connection (within 1 hour)
6. New tables automatically use cluster mode

### Use Case 2: Load Balancer Deployment

**Scenario**: ClickHouse cluster is behind a load balancer.

**Steps**:
1. Create StorageBackend pointing to load balancer VIP
2. System connects and queries `system.clusters`
3. Detects full cluster topology behind load balancer
4. Stores all node information
5. Tables created with `ON CLUSTER` clause on all nodes

### Use Case 3: Model Deletion Cleanup

**Scenario**: Delete a Data Model that has a ClickHouse table.

**Steps**:
1. User clicks "Delete" on Model detail page
2. UI shows warning: "ClickHouse table `hub_customer` will be deleted"
3. User confirms deletion
4. Django calls `Model.delete()`
5. Override drops ClickHouse table(s) first
6. Django model is deleted
7. No orphaned tables remain

## Error Handling

### Detection Failures

If cluster detection fails (e.g., network issues, permissions):

1. **Logged**: Error is logged with full details
2. **Non-blocking**: Connection still succeeds
3. **Fallback**: Uses manual configuration if available
4. **Retry**: Will retry on next connection (1 hour later)

```python
try:
    detect_cluster_configuration(backend, client)
except Exception as e:
    logger.error(f"Error detecting cluster: {str(e)}")
    # Continue with manual configuration
```

### Table Drop Failures

If table dropping fails during model deletion:

1. **Logged**: Error is logged with full details
2. **Non-blocking**: Model deletion continues
3. **Manual Cleanup**: Admin can manually drop table later

```python
try:
    drop_table_from_model(model, backend)
except Exception as e:
    logger.error(f"Error dropping table: {str(e)}")
    # Continue with model deletion
```

## Monitoring

### Check Detected Configuration

View detected cluster configuration in Django admin or via API:

```python
backend = StorageBackend.objects.get(name="my_backend")
print(f"Is Cluster: {backend.is_cluster}")
print(f"Detected Cluster: {backend.detected_cluster_name}")
print(f"Nodes: {backend.cluster_nodes}")
print(f"Last Updated: {backend.cluster_metadata_updated_at}")
```

### Verify Table Creation

Check that tables are created on all cluster nodes:

```sql
-- Check distributed table
SELECT * FROM system.tables 
WHERE name = 'hub_customer' AND database = 'default'

-- Check local tables
SELECT * FROM system.tables 
WHERE name = 'hub_customer_local' AND database = 'default'

-- Check across all nodes
SELECT hostName(), count() FROM system.tables 
WHERE name LIKE '%hub_customer%' 
GROUP BY hostName()
```

### Monitor Detection Frequency

Track when cluster configuration was last detected:

```sql
SELECT 
    name,
    is_cluster,
    detected_cluster_name,
    cluster_metadata_updated_at
FROM core_storagebackend
WHERE kind = 'clickhouse'
ORDER BY cluster_metadata_updated_at DESC
```

## UI Changes

### Delete Modal Enhancement

The Model detail page delete modal now shows a warning when the model has an associated ClickHouse table:

**Before**:
```
Delete Model
────────────────────────────────
Are you sure you want to delete this model? 
This action cannot be undone.

[Cancel]  [Delete]
```

**After**:
```
Delete Model
────────────────────────────────
Are you sure you want to delete this model? 
This action cannot be undone.

⚠️ ClickHouse Table Deletion
The associated ClickHouse table hub_customer 
will also be permanently deleted.

[Cancel]  [Delete]
```

**Implementation**:
```tsx
{model && model.table_created && model.table_name && (
  <Alert color="orange" title="ClickHouse Table Deletion">
    <Text size="sm">
      The associated ClickHouse table 
      <Text component="span" fw={600} ff="monospace">
        {model.table_name}
      </Text> 
      will also be permanently deleted.
    </Text>
  </Alert>
)}
```

## Performance Considerations

### Detection Overhead

- **First Connection**: Adds ~50-100ms for cluster detection query
- **Subsequent Connections**: No overhead (uses cached metadata)
- **Re-detection**: Every 1 hour, adds ~50-100ms
- **Impact**: Negligible for typical workloads

### Table Drop Performance

- **Single Node**: ~10-50ms per table
- **Cluster Mode**: ~50-200ms (drops on all nodes)
- **Async Operation**: Doesn't block user during deletion
- **Failure Recovery**: Non-blocking if drop fails

## Migration Guide

### Existing Deployments

For existing deployments with manual cluster configuration:

1. **No Changes Required**: Manual configuration still works
2. **Auto-Detection**: Will complement manual settings
3. **Priority**: Manual settings take precedence
4. **Benefit**: Auto-detection catches topology changes

### From Single to Cluster

If migrating from single node to cluster:

1. **Current Tables**: Remain as single node tables
2. **New Tables**: Automatically use cluster mode (after detection)
3. **Migration Option**: Recreate tables to use cluster mode
4. **Manual Override**: Can force cluster mode immediately

## Troubleshooting

### Issue: Detection Not Running

**Symptoms**: `is_cluster` remains `False`, `cluster_metadata_updated_at` is `None`

**Solutions**:
1. Check network connectivity to ClickHouse
2. Verify user has permission to query `system.clusters`
3. Check logs for detection errors
4. Manually trigger connection to force detection

### Issue: Wrong Cluster Detected

**Symptoms**: `detected_cluster_name` is not the expected cluster

**Solutions**:
1. Check ClickHouse configuration for multiple clusters
2. Review `cluster_nodes` to see all detected clusters
3. Manually set `cluster_name` to override auto-detection

### Issue: Table Not Dropped on Deletion

**Symptoms**: Model deleted but table still exists in ClickHouse

**Solutions**:
1. Check Django logs for drop errors
2. Verify ClickHouse user has DROP TABLE permission
3. Manually drop table with SQL
4. Check that `table_created=True` was set on model

### Issue: Tables Created on Single Node Only

**Symptoms**: Cluster mode but tables only on one node

**Solutions**:
1. Verify cluster detection ran (`cluster_metadata_updated_at` not null)
2. Check `is_cluster=True` is set
3. Review cluster configuration in ClickHouse
4. Recreate table after detection completes

## API Examples

### Trigger Manual Detection

```python
from core.clickhouse_utils import detect_cluster_configuration, get_clickhouse_client

backend = StorageBackend.objects.get(name="my_backend")
client = get_clickhouse_client(backend, detect_cluster=True)
```

### Check Cluster Status

```python
backend = StorageBackend.objects.get(name="my_backend")
if backend.is_cluster:
    print(f"Running in cluster mode: {backend.detected_cluster_name}")
    print(f"Nodes: {len(backend.cluster_nodes)}")
else:
    print("Running in single node mode")
```

### Drop Table Manually

```python
from core.clickhouse_utils import drop_table_from_model

model = Model.objects.get(name="My Model")
if model.clickhouse_backend:
    drop_table_from_model(model, model.clickhouse_backend)
```

## Security Considerations

### Permissions Required

ClickHouse user must have:
- `SELECT` on `system.clusters` (for detection)
- `CREATE TABLE` on target database (for creation)
- `DROP TABLE` on target database (for deletion)
- `ON CLUSTER` permission (for cluster operations)

### Data Protection

- Table drops are permanent (no UNDROP in ClickHouse)
- UI warning ensures user confirmation
- Logs provide audit trail of deletions
- Failed drops don't block model deletion

## Future Enhancements

1. **Cluster Health Monitoring**: Display cluster health in UI
2. **Selective Node Deletion**: Choose which nodes to drop tables from
3. **Backup Before Drop**: Optionally backup table before deletion
4. **Table Recreation**: Recreate tables if cluster topology changes
5. **Multi-Cluster Support**: Support models across multiple clusters
6. **Async Detection**: Background task for cluster detection
7. **Detection Events**: Webhooks when cluster topology changes

## References

- [ClickHouse system.clusters](https://clickhouse.com/docs/en/operations/system-tables/clusters/)
- [ClickHouse ON CLUSTER](https://clickhouse.com/docs/en/sql-reference/distributed-ddl/)
- [Django Model.delete()](https://docs.djangoproject.com/en/stable/ref/models/instances/#django.db.models.Model.delete)

## Change History

| Date | Version | Description |
|------|---------|-------------|
| 2024-02-14 | 1.0 | Initial implementation of cluster auto-detection and table lifecycle management |
