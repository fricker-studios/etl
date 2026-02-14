"""
ClickHouse utilities for table creation and data loading.
"""
import logging
from typing import List, Dict, Any, Optional
import clickhouse_connect
from clickhouse_connect.driver.client import Client
from core.models import StorageBackend, Model, TopicRevision

logger = logging.getLogger(__name__)


def get_clickhouse_client(backend: StorageBackend) -> Client:
    """
    Create a ClickHouse client from a StorageBackend configuration.
    
    Args:
        backend: StorageBackend instance with ClickHouse configuration
        
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
    password = backend.get_decrypted_password() if backend.password else None
    
    client = clickhouse_connect.get_client(
        host=host,
        port=port,
        username=backend.username or "default",
        password=password,
        database=backend.database or "default",
        secure=backend.secure,
    )
    
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
) -> None:
    """
    Create a Data Vault Hub table in ClickHouse.
    
    Args:
        client: ClickHouse client
        table_name: Name of the table to create
        database: Database name
        hub_definition: Hub definition from Model
        topic_revision: TopicRevision for schema
    """
    # Get business key field
    business_key = hub_definition.get("business_key")
    if not business_key:
        raise ValueError("Hub must have a business_key defined")
    
    # Build column definitions
    columns = []
    
    # Add standard Data Vault columns
    columns.append("hub_hash_key String")  # Business key hash
    columns.append("load_datetime DateTime64(3) DEFAULT now64(3)")
    columns.append("record_source String")
    
    # Get field mappings to determine which fields to include
    field_mappings = hub_definition.get("field_mappings", [])
    
    # Build a map of model fields to topic fields
    topic_schema = {field["name"]: field for field in topic_revision.schema}
    
    for mapping in field_mappings:
        model_field = mapping.get("model_field")
        topic_field = mapping.get("topic_field")
        
        if not model_field or not topic_field:
            continue
        
        # Get the field definition from topic
        field_def = topic_schema.get(topic_field)
        if not field_def:
            logger.warning(f"Topic field {topic_field} not found in schema")
            continue
        
        # Map to ClickHouse type
        ch_type = map_topic_field_to_clickhouse_type(field_def)
        columns.append(f"{model_field} {ch_type}")
    
    # Create the table DDL
    columns_sql = ",\n    ".join(columns)
    ddl = f"""
    CREATE TABLE IF NOT EXISTS {database}.{table_name} (
        {columns_sql}
    )
    ENGINE = MergeTree()
    ORDER BY (hub_hash_key)
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
                client, table_name, database, model.hubs[0], topic_revision
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
