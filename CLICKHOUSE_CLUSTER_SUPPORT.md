# ClickHouse Cluster Support for Data Models

## Overview

This document describes the ClickHouse cluster support implementation for Data Vault models, enabling production-grade distributed deployments with data replication and sharding.

## Problem Statement

Single-node ClickHouse deployments have limitations:
- No high availability
- No horizontal scalability
- Limited performance for large datasets
- No fault tolerance

Production deployments require:
1. **Data Replication**: Multiple copies of data across nodes
2. **Data Sharding**: Distribution of data across nodes for parallelism
3. **Transparent Access**: Applications insert/query through a single table interface

## Solution Architecture

### Cluster Mode Table Structure

For cluster deployments, the system creates two types of tables:

#### 1. Local Tables (on each node)
- **Name**: `{table_name}_local` (e.g., `hub_customer_local`)
- **Engine**: `ReplicatedMergeTree` for data replication
- **Purpose**: Stores actual data on each node
- **Replication Path**: `/clickhouse/tables/{shard}/{database}/{table_name}_local`

#### 2. Distributed Table (cluster-wide)
- **Name**: `{table_name}` (e.g., `hub_customer`)
- **Engine**: `Distributed` pointing to local tables
- **Purpose**: Provides transparent access to all data
- **Sharding**: Uses `rand()` for random distribution

### Data Flow

```
INSERT → Distributed Table → [Sharding Logic] → Local Tables (on different nodes)
SELECT → Distributed Table → [Query all nodes] → Aggregate Results
```

## Configuration

### StorageBackend Fields

```python
class StorageBackend:
    mode = CharField(choices=[("single", "Single"), ("cluster", "Cluster")])
    cluster_name = CharField(max_length=255, blank=True, null=True)
    # ... other fields
```

**Single Mode**:
- `mode = "single"`
- `cluster_name = None` (not used)

**Cluster Mode**:
- `mode = "cluster"`
- `cluster_name = "my_cluster"` (must match ClickHouse cluster configuration)

### ClickHouse Cluster Configuration

The cluster must be configured in ClickHouse's `config.xml`:

```xml
<clickhouse>
    <remote_servers>
        <my_cluster>
            <shard>
                <replica>
                    <host>node1.example.com</host>
                    <port>9000</port>
                </replica>
                <replica>
                    <host>node2.example.com</host>
                    <port>9000</port>
                </replica>
            </shard>
            <shard>
                <replica>
                    <host>node3.example.com</host>
                    <port>9000</port>
                </replica>
                <replica>
                    <host>node4.example.com</host>
                    <port>9000</port>
                </replica>
            </shard>
        </my_cluster>
    </remote_servers>
</clickhouse>
```

## Implementation Details

### Table Creation SQL

#### Single Mode
```sql
CREATE TABLE IF NOT EXISTS default.hub_customer (
    customer_hash_key String,
    load_datetime DateTime64(3) DEFAULT now64(3),
    record_source String,
    customer_id Int64,
    customer_name String
)
ENGINE = MergeTree()
ORDER BY (customer_hash_key)
```

#### Cluster Mode

**Step 1: Create Local Table**
```sql
CREATE TABLE IF NOT EXISTS default.hub_customer_local ON CLUSTER 'my_cluster' (
    customer_hash_key String,
    load_datetime DateTime64(3) DEFAULT now64(3),
    record_source String,
    customer_id Int64,
    customer_name String
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/default/hub_customer_local', '{replica}')
ORDER BY (customer_hash_key)
```

**Key Points**:
- `ON CLUSTER 'my_cluster'`: Creates table on all cluster nodes
- `ReplicatedMergeTree`: Enables data replication within shards
- `{shard}` and `{replica}`: Macros substituted by ClickHouse automatically
- Replication path includes shard for isolation

**Step 2: Create Distributed Table**
```sql
CREATE TABLE IF NOT EXISTS default.hub_customer ON CLUSTER 'my_cluster' 
AS default.hub_customer_local
ENGINE = Distributed('my_cluster', default, hub_customer_local, rand())
```

**Key Points**:
- Uses same column structure as local table (`AS` clause)
- Points to local tables via `Distributed` engine
- `rand()` provides random sharding (uniform distribution)
- Can be replaced with hash-based sharding: `intHash64(customer_hash_key)`

### Data Operations

#### INSERT Operations
```sql
-- Application inserts into distributed table
INSERT INTO default.hub_customer
SELECT ...
FROM s3(...)
WHERE MD5(toString(customer_id)) NOT IN (
    SELECT customer_hash_key FROM default.hub_customer
)
```

**What Happens**:
1. Distributed table receives INSERT
2. Sharding function (`rand()`) determines target shard
3. Data is written to local table on selected shard
4. ReplicatedMergeTree replicates within the shard

#### SELECT Operations
```sql
-- Application queries distributed table
SELECT * FROM default.hub_customer
WHERE customer_hash_key = 'abc123'
```

**What Happens**:
1. Query goes to distributed table
2. Distributed engine queries all shards in parallel
3. Results are aggregated and returned
4. ClickHouse optimizes queries based on WHERE clauses

## Sharding Strategies

### Random Sharding (Current Implementation)
```sql
ENGINE = Distributed('my_cluster', default, hub_customer_local, rand())
```

**Pros**:
- Simple and uniform distribution
- No hot spots
- Works for any data type

**Cons**:
- Related data may be on different shards
- No data locality for queries

### Hash-Based Sharding (Alternative)
```sql
ENGINE = Distributed('my_cluster', default, hub_customer_local, intHash64(customer_hash_key))
```

**Pros**:
- Same hash key always on same shard
- Better query locality
- Supports distributed joins

**Cons**:
- Possible hot spots if keys are not uniformly distributed
- Requires careful key design

**To Use Hash-Based Sharding**:
Modify `create_data_vault_hub_table()` in `clickhouse_utils.py`:
```python
distributed_ddl = f"""
CREATE TABLE IF NOT EXISTS {database}.{table_name} ON CLUSTER '{cluster_name}' 
AS {database}.{local_table_name}
ENGINE = Distributed('{cluster_name}', {database}, {local_table_name}, intHash64({hash_key_field}))
"""
```

## Replication

### Within-Shard Replication

Each shard can have multiple replicas for fault tolerance:

```xml
<shard>
    <replica>
        <host>node1</host>
    </replica>
    <replica>
        <host>node2</host>  <!-- Replica of node1 -->
    </replica>
</shard>
```

- Data written to one replica is automatically replicated to others
- Read queries can be served by any replica
- Automatic failover if a replica goes down

### ZooKeeper Requirement

`ReplicatedMergeTree` requires ZooKeeper for coordination:

```xml
<zookeeper>
    <node>
        <host>zk1.example.com</host>
        <port>2181</port>
    </node>
    <node>
        <host>zk2.example.com</host>
        <port>2181</port>
    </node>
    <node>
        <host>zk3.example.com</host>
        <port>2181</port>
    </node>
</zookeeper>
```

## Benefits

### High Availability
- Data replicated across multiple nodes
- Automatic failover if nodes fail
- No single point of failure

### Horizontal Scalability
- Add more shards to increase capacity
- Linear performance scaling
- Parallel query execution across shards

### Performance
- Distributed queries leverage all nodes
- Parallel data loading across shards
- Efficient resource utilization

### Operational Simplicity
- Applications use same SQL for single and cluster modes
- Transparent sharding and replication
- Standard ClickHouse operations

## Migration from Single to Cluster Mode

### Pre-Migration Checklist

1. **Set up ClickHouse cluster** with proper configuration
2. **Configure ZooKeeper** for replication coordination
3. **Test cluster connectivity** from application nodes
4. **Plan downtime** for migration

### Migration Steps

1. **Stop data loading** to the single-node table

2. **Export existing data**:
```sql
SELECT * FROM default.hub_customer
FORMAT Native
INTO OUTFILE '/tmp/hub_customer.native'
```

3. **Update StorageBackend configuration**:
```python
backend.mode = "cluster"
backend.cluster_name = "my_cluster"
backend.save()
```

4. **Drop old table** (optional, can rename instead):
```sql
DROP TABLE default.hub_customer
```

5. **Create cluster tables** using the application:
- Use "Create Table" button in UI
- Tables will be created in cluster mode

6. **Import data** into new distributed table:
```sql
INSERT INTO default.hub_customer
SELECT * FROM file('/tmp/hub_customer.native', Native)
```

7. **Resume data loading** operations

### Zero-Downtime Migration (Advanced)

1. Create cluster tables with temporary names
2. Use ClickHouse materialized views to replicate writes
3. Backfill historical data
4. Switch table names atomically
5. Update application configuration

## Monitoring

### Replication Status
```sql
SELECT 
    database,
    table,
    is_leader,
    total_replicas,
    active_replicas,
    queue_size
FROM system.replicas
WHERE table LIKE '%_local'
```

### Data Distribution
```sql
SELECT 
    hostName(),
    count() as row_count,
    uniq(customer_hash_key) as unique_keys
FROM default.hub_customer_local
GROUP BY hostName()
```

### Cluster Health
```sql
SELECT 
    cluster,
    shard_num,
    replica_num,
    host_name,
    errors_count
FROM system.clusters
WHERE cluster = 'my_cluster'
```

## Troubleshooting

### Issue: Table Creation Fails with "Unknown cluster"

**Cause**: cluster_name doesn't match ClickHouse configuration

**Solution**: Verify cluster name in ClickHouse config matches StorageBackend.cluster_name

### Issue: Replication Not Working

**Cause**: ZooKeeper not configured or unreachable

**Solution**: 
1. Check ZooKeeper configuration in ClickHouse
2. Verify network connectivity to ZooKeeper
3. Check ZooKeeper logs

### Issue: Uneven Data Distribution

**Cause**: Sharding function creates hot spots

**Solution**:
1. Switch to hash-based sharding
2. Verify hash key distribution
3. Rebalance shards if needed

### Issue: Slow Queries

**Cause**: Query not using distributed table optimizations

**Solution**:
1. Add WHERE clauses on sharding key
2. Use PREWHERE for filters
3. Optimize query to reduce cross-shard joins

## Performance Tuning

### Sharding Key Selection

Choose sharding keys based on query patterns:
- Most common filter: Use as sharding key
- Even distribution: Ensure key values are uniformly distributed
- Avoid skew: Monitor data distribution across shards

### Replication Factor

Balance between reliability and cost:
- 2 replicas: Basic fault tolerance
- 3 replicas: Production standard
- 5+ replicas: High availability requirements

### Batch Size

For optimal performance:
- Batch inserts in groups of 100k-1M rows
- Use async inserts for better throughput
- Monitor insert performance per shard

## Testing

### Unit Tests

Test single and cluster modes:
```python
def test_single_mode_table_creation():
    backend = StorageBackend(mode="single")
    table_name = create_table_from_model(model, backend)
    # Verify single table exists
    
def test_cluster_mode_table_creation():
    backend = StorageBackend(mode="cluster", cluster_name="test_cluster")
    table_name = create_table_from_model(model, backend)
    # Verify both local and distributed tables exist
```

### Integration Tests

1. **Data Distribution Test**: Insert data and verify it's distributed across shards
2. **Replication Test**: Kill a replica and verify data still accessible
3. **Query Test**: Query distributed table and verify correct results
4. **Deduplication Test**: Insert same data twice, verify no duplicates

## Future Enhancements

1. **Automatic Shard Key Selection**: Analyze query patterns to choose optimal sharding
2. **Dynamic Rebalancing**: Move data between shards for better balance
3. **Multi-Cluster Support**: Replicate across geographic regions
4. **Compression Configuration**: Optimize storage with appropriate compression
5. **TTL Policies**: Automatic data expiration based on age
6. **Materialized Views**: Pre-aggregate data for faster queries

## References

- [ClickHouse Distributed Tables](https://clickhouse.com/docs/en/engines/table-engines/special/distributed/)
- [ReplicatedMergeTree](https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/replication/)
- [ClickHouse Cluster Setup](https://clickhouse.com/docs/en/architecture/cluster-deployment/)
- Data Vault 2.0 Best Practices for Distributed Architectures

## Change History

| Date | Version | Description |
|------|---------|-------------|
| 2024-02-14 | 1.0 | Initial implementation of cluster support for Data Vault Hubs |
