# Data Model Table Creation and Loading - Implementation Summary

## Overview

This implementation adds the ability to create ClickHouse tables from Data Vault model definitions and load data from S3-based DataPackages into those tables. The system uses ClickHouse's S3 table function to virtualize data and perform transformations during the load process.

## Key Features Implemented

### 1. Table Creation from Models
- **Backend**: Create ClickHouse tables based on Model definitions
- **Support**: Data Vault Hubs (Links and Satellites to be implemented)
- **Schema Mapping**: Automatic translation from TopicRevision schema to ClickHouse DDL
- **Standard Columns**: Adds Data Vault standard columns (hub_hash_key, load_datetime, record_source)

### 2. Data Loading from S3
- **S3 Virtualization**: Uses ClickHouse S3 table function to read directly from S3
- **Format Detection**: Automatically detects file format (Parquet, CSV, JSON, etc.)
- **Transformations**: Supports hash transformation for business keys using MD5
- **Async Processing**: Uses Celery tasks for background data loading
- **Progress Tracking**: Real-time progress updates through Run model

### 3. Frontend UI
- **Create Table Button**: On Model detail page
- **Load Data Button**: Triggers data loading from all materialized packages
- **Progress Display**: Real-time progress with statistics and run history
- **Model Wizard Option**: Checkbox to create table automatically on save

## Architecture

### Backend Components

#### Models (backend/core/models.py)
- **Model**: Added `table_created`, `table_name`, `clickhouse_backend` fields
- **Run**: Added `model`, `data_package` fields for tracking model data loads

#### ClickHouse Utilities (backend/core/clickhouse_utils.py)
```python
# Key Functions:
- get_clickhouse_client() - Create ClickHouse client
- create_table_from_model() - Generate and execute CREATE TABLE DDL
- get_s3_table_function() - Generate S3 table function SQL
- map_topic_field_to_clickhouse_type() - Map data types
- detect_file_format() - Auto-detect file format
```

#### Celery Tasks (backend/core/tasks.py)
```python
@shared_task
def load_data_package_task(model_id, data_package_id, run_id=None):
    """
    Load data from a DataPackage into a Model's ClickHouse table.
    
    Process:
    1. Virtualizes S3 data using ClickHouse S3 table function
    2. Performs transformations (hash, etc.)
    3. Inserts into destination table
    4. Tracks progress via Run model
    5. Rolls back on error
    """
```

#### API Endpoints (backend/core/views.py)
- `POST /api/models/{id}/create_table/` - Create table
- `POST /api/models/{id}/load_data/` - Queue data loading tasks
- `GET /api/models/{id}/loading_progress/` - Get loading status

### Frontend Components

#### ModelDetailPage (frontend/src/pages/ModelDetailPage.tsx)
- Create Table button with mutation hook
- Load Data button with mutation hook
- Real-time progress display with polling (5 second interval)
- Progress bar, statistics, and run history table

#### ModelWizard (frontend/src/features/models/ModelWizard.tsx)
- Added "Create table on save" checkbox
- Automatically calls create_table API after model creation

## Data Flow

### Table Creation Flow
```
1. User clicks "Create Table" button
2. Frontend calls POST /api/models/{id}/create_table/
3. Backend:
   - Gets Model and ClickHouse backend
   - Generates table name (e.g., "hub_customer")
   - Gets TopicRevision schema
   - Maps fields to ClickHouse types
   - Generates CREATE TABLE DDL
   - Executes DDL via ClickHouse client
4. Updates Model with table_created=True, table_name
5. Frontend refreshes and shows table stats
```

### Data Loading Flow
```
1. User clicks "Load Data" button
2. Frontend calls POST /api/models/{id}/load_data/
3. Backend:
   - Finds all Topics associated with Model
   - Gets TopicRevisions for those Topics
   - Finds all materialized DataPackages
   - Creates a Run for each package
   - Queues Celery task for each package
4. Celery Worker:
   - Gets S3 credentials and file path
   - Generates S3 table function SQL
   - Builds INSERT INTO SELECT with transformations
   - Executes query (ClickHouse loads from S3)
   - Updates Run status and row count
   - Rolls back on error
5. Frontend polls loading_progress endpoint
6. Displays real-time progress and run history
```

## Example SQL Generated

### Table Creation (Data Vault Hub)
```sql
CREATE TABLE IF NOT EXISTS default.hub_customer (
    hub_hash_key String,
    load_datetime DateTime64(3) DEFAULT now64(3),
    record_source String,
    customer_id Nullable(Int64),
    customer_name String,
    email String
)
ENGINE = MergeTree()
ORDER BY (hub_hash_key)
```

### Data Loading with S3 Virtualization
```sql
INSERT INTO default.hub_customer
SELECT
    MD5(toString(id)) as hub_hash_key,
    now64(3) as load_datetime,
    'customers_2024_01.parquet' as record_source,
    id as customer_id,
    name as customer_name,
    email as email
FROM s3(
    'https://s3.amazonaws.com/my-bucket/data/customers_2024_01.parquet',
    'ACCESS_KEY',
    'SECRET_KEY',
    'Parquet'
)
```

## Configuration Requirements

### ClickHouse Backend
Required fields:
- `kind`: "clickhouse"
- `hosts`: `[{"host": "localhost", "port": 8123}]`
- `database`: Database name (default: "default")
- `username`: ClickHouse user
- `password`: Encrypted password
- `secure`: TLS enabled (true/false)

### S3 Source for Data Packages
Required fields:
- `kind`: "s3"
- `endpoint`: S3 endpoint URL
- `bucket`: Bucket name
- `access_key_id`: AWS access key
- `secret_access_key`: Encrypted secret key

## Security Features

1. **Credential Encryption**: S3 and ClickHouse passwords encrypted at rest using Fernet
2. **Decryption on Use**: Credentials only decrypted when needed for connections
3. **Transaction Safety**: ClickHouse inserts are atomic
4. **Rollback on Error**: Failed inserts attempt to clean up via ALTER TABLE DELETE
5. **User Isolation**: All operations filtered by authenticated user

## Error Handling

### Table Creation Errors
- Missing ClickHouse backend → User-friendly error message
- Invalid schema → Validation error
- DDL execution failure → Rolled back, error logged

### Data Loading Errors
- Missing table → Run marked as failed
- S3 connection error → Run marked as failed, error logged
- Query execution error → Attempt rollback, Run marked as failed
- All errors logged with full traceback

## Performance Considerations

1. **S3 Virtualization**: No intermediate storage needed, ClickHouse reads directly from S3
2. **Async Processing**: Data loading happens in background via Celery
3. **Batch Processing**: Entire package loaded in single INSERT statement
4. **Progress Polling**: Frontend polls every 5 seconds (configurable)
5. **ClickHouse MergeTree**: Optimized for analytical queries

## Limitations and Future Work

### Current Limitations
1. Only Data Vault Hubs supported (Links and Satellites not yet implemented)
2. Only hash transformation supported (no other transforms yet)
3. No support for incremental loads (full refresh only)
4. No data quality validation
5. Clusters not yet handled (TODO in code)

### Future Enhancements
1. **Link Tables**: Implement link table creation with multiple hub references
2. **Satellite Tables**: Implement satellite table creation with parent hub reference
3. **Dimensional Tables**: Implement fact and dimension table creation
4. **More Transformations**: Support cast, concat, substring, etc.
5. **Incremental Loads**: Support incremental loading with CDC
6. **Data Quality**: Add validation rules and quality checks
7. **Cluster Support**: Handle ClickHouse clusters with distributed tables
8. **Schema Evolution**: Handle schema changes and migrations
9. **Partitioning**: Support table partitioning by date or other keys
10. **Monitoring**: Add metrics and alerting for data loads

## Testing

### Manual Testing Steps
1. **Prerequisites**:
   - Configure ClickHouse backend
   - Configure S3 data source
   - Create Topic with schema
   - Create Stream to load data into S3
   - Run Stream to create DataPackages
   - Create Model (Data Vault Hub)

2. **Test Table Creation**:
   - Navigate to Model detail page
   - Click "Create Table" button
   - Verify table created in ClickHouse
   - Check table stats are displayed

3. **Test Data Loading**:
   - Click "Load Data" button
   - Monitor progress in real-time
   - Verify data loaded in ClickHouse
   - Check Run history

4. **Test Auto-Create**:
   - Use Model Wizard
   - Check "Create table on save"
   - Verify table created automatically

### Unit Tests
The implementation follows the existing test patterns in `backend/core/tests.py`. Future tests should cover:
- Table creation logic
- S3 table function generation
- Data type mapping
- Transformation logic
- Error handling and rollback

## Migration

### Database Migration
```bash
# Backend migration for new fields
python manage.py migrate
```

The migration `0012_add_table_tracking_and_model_runs.py` adds:
- `Model.table_created` (BooleanField)
- `Model.table_name` (CharField)
- `Model.clickhouse_backend` (ForeignKey to StorageBackend)
- `Run.model` (ForeignKey to Model)
- `Run.data_package` (ForeignKey to DataPackage)

## Dependencies

### Backend
- `clickhouse-connect`: ClickHouse Python client
- `boto3`: S3 integration (already present)
- `celery`: Async task execution (already present)

### Frontend
- No new dependencies required
- Uses existing Mantine UI components
- Uses TanStack Query for state management

## Documentation Updates

### README.md
- Added ClickHouse integration to features list
- Added new API endpoints to documentation

### Code Documentation
- All new functions have docstrings
- Type hints included
- Complex logic explained with comments

## Deployment Notes

1. **Database Migration**: Run `python manage.py migrate` before deployment
2. **Celery Workers**: Ensure Celery workers are running to process data loading tasks
3. **ClickHouse Access**: Ensure backend can connect to ClickHouse on configured port
4. **S3 Access**: Ensure ClickHouse can access S3 (network/firewall rules)
5. **Environment Variables**: No new environment variables required
6. **Frontend Build**: Run `npm run build` to build frontend with new features

## Conclusion

This implementation provides a solid foundation for creating ClickHouse tables from Data Vault models and loading data from S3. The architecture is extensible and can be enhanced to support more model types, transformations, and data quality features in the future.
