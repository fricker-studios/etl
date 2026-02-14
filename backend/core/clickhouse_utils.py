"""
ClickHouse utilities for table creation and data loading.
"""
import logging
from typing import List, Dict, Any, Optional
from datetime import timezone as dt_timezone
import clickhouse_connect
from clickhouse_connect.driver.client import Client
from core.models import StorageBackend, Model, TopicRevision
from django.utils import timezone

logger = logging.getLogger(__name__)


def detect_cluster_configuration(backend: StorageBackend, client: Client) -> None:
    """
    Auto-detect ClickHouse cluster configuration and store in backend.
    
    Queries ClickHouse system tables to determine:
    - If running in cluster mode
    - Cluster name(s)
    - Cluster nodes
    - Database cluster status
    
    Args:
        backend: StorageBackend instance to update with detected configuration
        client: ClickHouse client connection
    """
    try:
        # Query for clusters
        clusters_query = "SELECT cluster, shard_num, replica_num, host_name, port FROM system.clusters"
        clusters_result = client.query(clusters_query)
        
        if clusters_result.row_count > 0:
            # We have clusters
            backend.is_cluster = True
            
            # Get unique cluster names
            cluster_names = set()
            cluster_nodes = []
            
            for row in clusters_result.named_results():
                cluster_names.add(row['cluster'])
                cluster_nodes.append({
                    'cluster': row['cluster'],
                    'shard': row['shard_num'],
                    'replica': row['replica_num'],
                    'host': row['host_name'],
                    'port': row.get('port', 9000)
                })
            
            backend.cluster_nodes = cluster_nodes
            
            # If only one cluster, auto-detect it
            if len(cluster_names) == 1:
                backend.detected_cluster_name = list(cluster_names)[0]
                # If user hasn't manually set cluster_name, use detected one
                if not backend.cluster_name:
                    backend.cluster_name = backend.detected_cluster_name
                    backend.mode = "cluster"
            elif len(cluster_names) > 1:
                # Multiple clusters - store first one as detected
                backend.detected_cluster_name = sorted(cluster_names)[0]
                logger.info(f"Multiple clusters detected: {cluster_names}. Using {backend.detected_cluster_name}")
            
            logger.info(f"Detected cluster configuration: {len(cluster_nodes)} nodes in {len(cluster_names)} cluster(s)")
        else:
            # No clusters detected - single node mode
            backend.is_cluster = False
            backend.detected_cluster_name = None
            backend.cluster_nodes = []
            logger.info("No clusters detected - running in single node mode")
        
        backend.cluster_metadata_updated_at = timezone.now()
        backend.save()
        
    except Exception as e:
        logger.error(f"Error detecting cluster configuration: {str(e)}")
        # Don't fail - just log and continue with whatever configuration was set manually
        backend.is_cluster = False
        backend.cluster_metadata_updated_at = timezone.now()
        backend.save()


def get_transformation(mapping: Dict[str, Any]) -> str:
    """
    Get the transformation value from a field mapping.
    Supports both 'transformation' and 'transform' keys for backward compatibility.
    
    Args:
        mapping: Field mapping dictionary
        
    Returns:
        Transformation string or empty string if not found
    """
    return mapping.get("transformation", mapping.get("transform", ""))


def get_clickhouse_client(backend: StorageBackend, detect_cluster: bool = True) -> Client:
    """
    Create a ClickHouse client from a StorageBackend configuration.
    Auto-detects cluster configuration on first connect.
    
    Args:
        backend: StorageBackend instance with ClickHouse configuration
        detect_cluster: Whether to auto-detect cluster configuration (default True)
        
    Returns:
        ClickHouse client instance
    """
    if backend.kind != "clickhouse":
        raise ValueError(f"Backend {backend.name} is not a ClickHouse backend")
    
    if not backend.hosts or not isinstance(backend.hosts, list) or len(backend.hosts) == 0:
        raise ValueError(f"Backend {backend.name} has no hosts configured")
    
    # Get the first host for single mode, or use cluster for cluster mode
    host_config = backend.hosts[0]
    host = host_config.get("host", "localhost")
    port = host_config.get("port", 8123)  # Default HTTP port for ClickHouse
    
    # Get decrypted password
    password = backend.get_decrypted_password() or ""
    
    client = clickhouse_connect.get_client(
        host=host,
        port=port,
        username=backend.username or "default",
        password=password,
        database=backend.database or "default",
        secure=backend.secure,
    )
    
    # Auto-detect cluster configuration if not done recently
    if detect_cluster:
        should_detect = (
            backend.cluster_metadata_updated_at is None or
            (timezone.now() - backend.cluster_metadata_updated_at).total_seconds() > 3600  # Re-detect every hour
        )
        
        if should_detect:
            detect_cluster_configuration(backend, client)
    
    return client


def map_topic_field_to_clickhouse_type(field: Dict[str, Any]) -> str:
    """
    Map a topic field definition to a ClickHouse data type.
    
    Args:
        field: Field definition from TopicRevision schema
        
    Returns:
        ClickHouse data type string
    """
    data_type = field.get("data_type", "string").lower()
    nullable = field.get("nullable", True)
    
    # Map common data types
    type_mapping = {
        "integer": "Int64",
        "int": "Int64",
        "bigint": "Int64",
        "smallint": "Int32",
        "float": "Float64",
        "double": "Float64",
        "decimal": "Decimal(18, 2)",
        "string": "String",
        "text": "String",
        "varchar": "String",
        "boolean": "Bool",
        "bool": "Bool",
        "date": "Date",
        "datetime": "DateTime",
        "timestamp": "DateTime64(3)",
        "json": "String",  # Store JSON as string
        "array": "Array(String)",
    }
    
    clickhouse_type = type_mapping.get(data_type, "String")
    
    # Add Nullable wrapper if needed
    if nullable and clickhouse_type not in ["String", "Array(String)"]:
        clickhouse_type = f"Nullable({clickhouse_type})"
    
    return clickhouse_type


def generate_table_name(model: Model) -> str:
    """
    Generate a table name for a model based on its type and entities.
    
    Args:
        model: Model instance
        
    Returns:
        Table name string
    """
    # Get the first entity to determine the type
    if model.type == "data_vault":
        if model.hubs:
            entity = model.hubs[0]
            entity_type = "hub"
        elif model.links:
            entity = model.links[0]
            entity_type = "link"
        elif model.satellites:
            entity = model.satellites[0]
            entity_type = "satellite"
        else:
            entity_type = "entity"
            entity = {"name": model.name}
    else:  # dimensional
        if model.facts:
            entity = model.facts[0]
            entity_type = "fact"
        elif model.dimensions:
            entity = model.dimensions[0]
            entity_type = "dimension"
        else:
            entity_type = "entity"
            entity = {"name": model.name}
    
    # Use entity name if available, otherwise use model name
    entity_name = entity.get("name", model.name)
    
    # Clean the name
    clean_name = entity_name.lower().replace(" ", "_").replace("-", "_")
    
    # Remove any prefix that might already be there
    for prefix in ["hub_", "link_", "satellite_", "sat_", "fact_", "dim_", "dimension_"]:
        if clean_name.startswith(prefix):
            clean_name = clean_name[len(prefix):]
            break
    
    return f"{entity_type}_{clean_name}"


def get_topic_revision_schema(model: Model) -> Optional[TopicRevision]:
    """
    Get the topic revision schema for a model.
    
    Args:
        model: Model instance
        
    Returns:
        TopicRevision instance or None
    """
    # Get the first entity
    if model.type == "data_vault":
        entity = model.hubs[0] if model.hubs else (
            model.links[0] if model.links else (
                model.satellites[0] if model.satellites else None
            )
        )
    else:  # dimensional
        entity = model.facts[0] if model.facts else (
            model.dimensions[0] if model.dimensions else None
        )
    
    if not entity:
        return None
    
    # Get the topic_id from the entity
    topic_id = entity.get("topic")
    if not topic_id:
        return None
    
    # Get the current revision for this topic
    from core.models import Topic
    try:
        topic = Topic.objects.get(id=topic_id)
        return topic.current_revision
    except Topic.DoesNotExist:
        return None


def create_data_vault_hub_table(
    client: Client,
    table_name: str,
    database: str,
    hub_definition: Dict[str, Any],
    topic_revision: TopicRevision,
    backend: StorageBackend = None,
) -> None:
    """
    Create a Data Vault Hub table in ClickHouse.
    For cluster mode, creates both local and distributed tables.
    
    Args:
        client: ClickHouse client
        table_name: Name of the table to create
        database: Database name
        hub_definition: Hub definition from Model
        topic_revision: TopicRevision for schema
        backend: StorageBackend instance (optional, for cluster support)
    """
    # Get business key field
    business_key = hub_definition.get("business_key")
    if not business_key:
        raise ValueError("Hub must have a business_key defined")
    
    # Build column definitions
    columns = []
    column_names = set()  # Track column names to prevent duplicates
    
    # Get field mappings to determine which fields to include
    field_mappings = hub_definition.get("field_mappings", [])
    
    # Build a map of model fields to topic fields
    topic_schema = {field["name"]: field for field in topic_revision.schema}
    
    # First pass: collect all model fields from mappings
    model_fields_from_mappings = set()
    for mapping in field_mappings:
        model_field = mapping.get("model_field")
        if model_field:
            model_fields_from_mappings.add(model_field)
    
    # Add standard Data Vault columns if not already in mappings
    # These are auto-generated during data load
    if "load_datetime" not in model_fields_from_mappings:
        columns.append("load_datetime DateTime64(3) DEFAULT now64(3)")
        column_names.add("load_datetime")
    
    if "record_source" not in model_fields_from_mappings:
        columns.append("record_source String")
        column_names.add("record_source")
    
    # Determine the hash key column name from mappings
    # Look for a field with hash transformation - that's our hash key
    hash_key_field = None
    for mapping in field_mappings:
        transform = get_transformation(mapping)
        if transform and transform.startswith("hash"):
            hash_key_field = mapping.get("model_field")
            break
    
    # If no hash key field found in mappings, use standard name
    if not hash_key_field:
        hash_key_field = "hub_hash_key"
    
    # Add hash key column if not already added
    if hash_key_field not in column_names:
        columns.insert(0, f"{hash_key_field} String")
        column_names.add(hash_key_field)
    
    # Add mapped fields
    for mapping in field_mappings:
        model_field = mapping.get("model_field")
        topic_field = mapping.get("topic_field")
        
        if not model_field or not topic_field:
            continue
        
        # Skip if column already exists
        if model_field in column_names:
            logger.debug(f"Skipping duplicate column: {model_field}")
            continue
        
        # Get the field definition from topic
        field_def = topic_schema.get(topic_field)
        if not field_def:
            logger.warning(f"Topic field {topic_field} not found in schema")
            continue
        
        # Map to ClickHouse type
        ch_type = map_topic_field_to_clickhouse_type(field_def)
        columns.append(f"{model_field} {ch_type}")
        column_names.add(model_field)
    
    # Create the table DDL
    columns_sql = ",\n    ".join(columns)
    
    # Check if we're in cluster mode
    # Use detected cluster info if available, otherwise fall back to manual settings
    use_cluster = backend and (backend.is_cluster or (backend.mode == "cluster" and backend.cluster_name))
    cluster_name = backend.detected_cluster_name if backend and backend.detected_cluster_name else (backend.cluster_name if backend else None)
    
    if use_cluster and cluster_name:
        # Create local table on each node (with _local suffix)
        local_table_name = f"{table_name}_local"
        
        # Clean up any leftover ZooKeeper metadata from previous tables with the same name
        # This handles cases where a table was dropped but ZooKeeper metadata wasn't fully cleaned up
        try:
            replicas_query = f"SELECT DISTINCT replica_num, host_name FROM system.clusters WHERE cluster = '{cluster_name}'"
            replicas = client.query(replicas_query).result_rows
            
            # ZooKeeper path for the local table (with macro placeholders)
            zk_path = f'/clickhouse/tables/{{{{shard}}}}/{database}/{local_table_name}'
            
            for replica_num, host_name in replicas:
                try:
                    cleanup_cmd = f"SYSTEM DROP REPLICA '{host_name}' FROM ZKPATH '{zk_path}'"
                    client.command(cleanup_cmd)
                    logger.info(f"Cleaned up replica {host_name} from ZooKeeper path {zk_path}")
                except Exception as cleanup_err:
                    # Replica may not exist in ZooKeeper, which is fine
                    logger.debug(f"Could not cleanup replica {host_name}: {cleanup_err}")
        except Exception as e:
            logger.warning(f"Could not cleanup replicas before table creation: {e}")
            # Continue with table creation even if cleanup fails
        
        # For cluster mode, use ReplicatedMergeTree for replication
        local_ddl = f"""
        CREATE TABLE IF NOT EXISTS {database}.{local_table_name} ON CLUSTER '{cluster_name}' (
            {columns_sql}
        )
        ENGINE = ReplicatedMergeTree('/clickhouse/tables/{{shard}}/{database}/{local_table_name}', '{{replica}}')
        ORDER BY ({hash_key_field})
        """
        
        logger.info(f"Creating local hub table with DDL: {local_ddl}")
        client.command(local_ddl)
        
        # Create distributed table that shards across local tables
        # Using rand() for random sharding based on all data
        distributed_ddl = f"""
        CREATE TABLE IF NOT EXISTS {database}.{table_name} ON CLUSTER '{cluster_name}' AS {database}.{local_table_name}
        ENGINE = Distributed('{cluster_name}', {database}, {local_table_name}, rand())
        """
        
        logger.info(f"Creating distributed hub table with DDL: {distributed_ddl}")
        client.command(distributed_ddl)
    else:
        # Single node mode - create standard MergeTree table
        ddl = f"""
        CREATE TABLE IF NOT EXISTS {database}.{table_name} (
            {columns_sql}
        )
        ENGINE = MergeTree()
        ORDER BY ({hash_key_field})
        """
        
        logger.info(f"Creating hub table with DDL: {ddl}")
        client.command(ddl)



def create_table_from_model(model: Model, backend: StorageBackend) -> str:
    """
    Create a ClickHouse table from a Model definition.
    
    Args:
        model: Model instance
        backend: ClickHouse StorageBackend
        
    Returns:
        Table name that was created
    """
    client = get_clickhouse_client(backend)
    database = backend.database or "default"
    
    # Generate table name
    table_name = generate_table_name(model)
    
    # Get topic revision for schema
    topic_revision = get_topic_revision_schema(model)
    if not topic_revision:
        raise ValueError(f"Model {model.name} has no topic revision schema")
    
    # Create table based on model type
    if model.type == "data_vault":
        if model.hubs:
            create_data_vault_hub_table(
                client, table_name, database, model.hubs[0], topic_revision, backend
            )
        elif model.links:
            # TODO: Implement link table creation
            raise NotImplementedError("Link table creation not yet implemented")
        elif model.satellites:
            # TODO: Implement satellite table creation
            raise NotImplementedError("Satellite table creation not yet implemented")
        else:
            raise ValueError(f"Model {model.name} has no entities defined")
    else:
        # TODO: Implement dimensional table creation
        raise NotImplementedError("Dimensional table creation not yet implemented")
    
    return table_name


def drop_table_from_model(model: Model, backend: StorageBackend) -> None:
    """
    Drop a ClickHouse table for a Model.
    Handles both single node and cluster modes.
    
    Args:
        model: Model instance with table information
        backend: ClickHouse StorageBackend
    """
    if not model.table_name or not model.table_created:
        logger.info(f"Model {model.name} has no table to drop")
        return
    
    try:
        client = get_clickhouse_client(backend, detect_cluster=False)
        database = backend.database or "default"
        table_name = model.table_name
        
        # Determine if we should use cluster mode
        # Use detected cluster info if available, otherwise fall back to manual settings
        use_cluster = backend.is_cluster or (backend.mode == "cluster" and backend.cluster_name)
        cluster_name = backend.detected_cluster_name or backend.cluster_name
        
        if use_cluster and cluster_name:
            # Drop distributed table with SYNC to ensure ZooKeeper cleanup
            drop_distributed = f"DROP TABLE IF EXISTS {database}.{table_name} ON CLUSTER '{cluster_name}' SYNC"
            logger.info(f"Dropping distributed table: {drop_distributed}")
            client.command(drop_distributed)
            
            # Drop local table with SYNC to ensure ZooKeeper cleanup
            local_table_name = f"{table_name}_local"
            drop_local = f"DROP TABLE IF EXISTS {database}.{local_table_name} ON CLUSTER '{cluster_name}' SYNC"
            logger.info(f"Dropping local table: {drop_local}")
            client.command(drop_local)
        else:
            # Single node mode - drop single table
            drop_sql = f"DROP TABLE IF EXISTS {database}.{table_name}"
            logger.info(f"Dropping table: {drop_sql}")
            client.command(drop_sql)
        
        logger.info(f"Successfully dropped table(s) for model {model.name}")
        
    except Exception as e:
        logger.error(f"Error dropping table for model {model.name}: {str(e)}")
        # Don't raise - we don't want to block model deletion if table drop fails



def get_s3_table_function(
    s3_endpoint: str,
    s3_access_key: str,
    s3_secret_key: str,
    bucket: str,
    file_path: str,
    file_format: str = "Parquet",
) -> str:
    """
    Generate a ClickHouse S3 table function for virtualizing S3 data.
    
    Args:
        s3_endpoint: S3 endpoint URL
        s3_access_key: S3 access key
        s3_secret_key: S3 secret key
        bucket: S3 bucket name
        file_path: Path to file in bucket
        file_format: File format (Parquet, CSV, JSONEachRow, etc.)
        
    Returns:
        S3 table function SQL
    """
    # Build the S3 URL
    s3_url = f"{s3_endpoint}/{bucket}/{file_path}"
    
    # Return the table function
    return f"s3('{s3_url}', '{s3_access_key}', '{s3_secret_key}', '{file_format}')"


def detect_file_format(file_path: str) -> str:
    """
    Detect ClickHouse format from file extension.
    
    Args:
        file_path: Path to file
        
    Returns:
        ClickHouse format string
    """
    file_path_lower = file_path.lower()
    
    if file_path_lower.endswith(".parquet"):
        return "Parquet"
    elif file_path_lower.endswith(".csv"):
        return "CSV"
    elif file_path_lower.endswith(".json"):
        return "JSONEachRow"
    elif file_path_lower.endswith(".ndjson"):
        return "JSONEachRow"
    elif file_path_lower.endswith(".tsv"):
        return "TSV"
    else:
        # Default to CSV
        logger.warning(f"Unknown file extension for {file_path}, defaulting to CSV")
        return "CSV"
