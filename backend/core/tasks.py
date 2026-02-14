"""
Celery tasks for ETL operations.
"""

from celery import shared_task
from django.utils import timezone
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)


@shared_task(bind=True, name="core.execute_stream_task")
def execute_stream_task(self, stream_id, run_id=None):
    """
    Execute a stream and create data packages from discovered files.

    Args:
        stream_id: ID of the stream to execute
        run_id: Optional ID of the Run instance to track progress

    Returns:
        dict: Execution results including packages created
    """
    from core.models import Stream, DataPackage, Run
    from core.s3_utils import S3FileDiscovery

    try:
        # Get the stream
        stream = Stream.objects.select_related("data_source", "topic", "user").get(
            id=stream_id
        )

        # Get or create Run instance
        if run_id:
            run = Run.objects.get(id=run_id)
        else:
            run = Run.objects.create(
                user=stream.user,
                stream=stream,
                name=f"{stream.name} - {timezone.now().strftime('%Y-%m-%d %H:%M:%S')}",
                status="running",
                started_at=timezone.now(),
            )

        # Update run status to running
        run.status = "running"
        run.started_at = timezone.now()
        run.save()

        logger.info(f"Executing stream {stream_id} (Run ID: {run.id})")

        # Check that stream has a data source
        if not stream.data_source:
            error_msg = "Stream does not have a data source configured"
            run.status = "failed"
            run.error_message = error_msg
            run.completed_at = timezone.now()
            run.duration_seconds = int(
                (run.completed_at - run.started_at).total_seconds()
            )
            run.save()
            raise ValueError(error_msg)

        if not stream.topic:
            error_msg = f"Stream {stream.name} does not have a topic assigned"
            run.status = "failed"
            run.error_message = error_msg
            run.completed_at = timezone.now()
            run.duration_seconds = int(
                (run.completed_at - run.started_at).total_seconds()
            )
            run.save()
            raise ValueError(error_msg)

        # Execute stream based on data source type
        if stream.data_source.type == "s3":
            result = _execute_s3_stream(stream, run)
        elif stream.data_source.type == "api":
            result = _execute_api_stream(stream, run)
        else:
            error_msg = f"Unsupported data source type: {stream.data_source.type}. Supported types: s3, api"
            run.status = "failed"
            run.error_message = error_msg
            run.completed_at = timezone.now()
            run.duration_seconds = int(
                (run.completed_at - run.started_at).total_seconds()
            )
            run.save()
            raise ValueError(error_msg)

        # Update run with success
        run.status = "success"
        run.completed_at = timezone.now()
        run.duration_seconds = int((run.completed_at - run.started_at).total_seconds())
        run.rows_processed = result.get(
            "records_fetched", result.get("packages_created", 0)
        )
        run.save()

        logger.info(f"Successfully executed stream {stream_id} (Run ID: {run.id})")

        return {
            "status": "success",
            "run_id": run.id,
            "packages_created": result.get("packages_created", 0),
            "packages_skipped": result.get("packages_skipped", 0),
            "records_fetched": result.get("records_fetched", 0),
        }

    except Exception as e:
        logger.error(f"Error executing stream {stream_id}: {e}", exc_info=True)

        # Update run with failure
        if "run" in locals():
            run.status = "failed"
            run.error_message = str(e)
            run.completed_at = timezone.now()
            run.duration_seconds = int(
                (run.completed_at - run.started_at).total_seconds()
            )
            run.save()

        raise


def _execute_s3_stream(stream, run):
    """
    Execute an S3 stream - discover files and create data packages.

    Args:
        stream: Stream instance
        run: Run instance for tracking

    Returns:
        dict: Execution results
    """
    from core.models import DataPackage
    from core.s3_utils import S3FileDiscovery

    data_source = stream.data_source

    logger.info(f"Executing S3 stream: {stream.name}")
    logger.info(f"  Bucket: {data_source.s3_bucket}")
    logger.info(f"  Path Pattern: {stream.s3_path_pattern}")
    logger.info(f"  Topic: {stream.topic.name}")

    # Initialize S3 client
    s3_discovery = S3FileDiscovery(
        endpoint_url=data_source.s3_endpoint,
        region=data_source.s3_region or "us-east-1",
        access_key=data_source.s3_access_key,
        secret_key=data_source.get_decrypted_s3_secret_key(),
    )

    # Discover files
    files = s3_discovery.list_files(
        bucket=data_source.s3_bucket,
        path_pattern=stream.s3_path_pattern,
        max_files=1000,  # Limit to 1000 files per execution
    )

    logger.info(f"Found {len(files)} file(s) matching pattern")

    # Create data packages for each file
    created_count = 0
    skipped_count = 0

    for file in files:
        # Check if package already exists for this file (prevent duplicates)
        existing = DataPackage.objects.filter(
            stream=stream, file_path=file["key"]
        ).first()

        if existing:
            logger.debug(f"Skipping existing package: {file['key']}")
            skipped_count += 1
            continue

        # Use the original file name (without path) as the package name
        package_name = file["key"].split("/")[-1]

        # Get the current revision of the topic
        current_revision = stream.topic.current_revision
        if not current_revision:
            logger.warning(f"Topic {stream.topic.name} has no revisions, skipping")
            continue

        # Create data package
        package = DataPackage.objects.create(
            user=stream.user,
            name=package_name,
            topic_revision=current_revision,
            stream=stream,
            file_path=file["key"],
            file_size_bytes=file["size"],
            status="materialized",  # S3 files already exist
            external_s3_source=data_source,  # Store reference to external S3 source
        )

        created_count += 1
        logger.info(f"Created package: {package.name}")

    logger.info(f"Created {created_count} package(s), skipped {skipped_count} existing")

    return {
        "packages_created": created_count,
        "packages_skipped": skipped_count,
    }


def _execute_api_stream(stream, run):
    """
    Execute an API stream - fetch data from API and upload to S3.

    Args:
        stream: Stream instance
        run: Run instance for tracking

    Returns:
        dict: Execution results
    """
    from core.models import DataPackage, StorageBackend
    from core.api_utils import APIClient
    import boto3
    import json
    from datetime import datetime

    data_source = stream.data_source

    logger.info(f"Executing API stream: {stream.name}")
    logger.info(f"  Base URL: {data_source.base_url}")
    logger.info(f"  Method: {stream.method}")
    logger.info(f"  Path: {stream.path}")
    logger.info(f"  Topic: {stream.topic.name}")

    # Get S3 storage backend for the user
    storage_backend = StorageBackend.objects.filter(user=stream.user, kind="s3").first()

    if not storage_backend:
        error_msg = "No S3 storage backend configured. Please configure an S3 storage backend in Settings."
        logger.error(error_msg)
        raise ValueError(error_msg)

    logger.info(f"  Using storage backend: {storage_backend.name}")
    logger.info(f"  S3 Bucket: {storage_backend.bucket}")

    # Get decrypted credentials for API
    bearer_token = data_source.get_decrypted_bearer_token()
    basic_pass = data_source.get_decrypted_basic_pass()
    header_value = data_source.get_decrypted_header_value()

    # Initialize API client
    api_client = APIClient(
        base_url=data_source.base_url,
        auth_type=data_source.auth_type,
        bearer_token=bearer_token,
        basic_user=data_source.basic_user,
        basic_pass=basic_pass,
        header_name=data_source.header_name,
        header_value=header_value,
    )

    # Log configuration
    logger.info(f"  Query params: {stream.query_params}")
    logger.info(f"  Pagination config: {stream.pagination}")
    logger.info(f"  Records selector: {stream.records_selector}")

    # Fetch paginated data
    try:
        records = api_client.fetch_paginated_data(
            method=stream.method or "GET",
            path=stream.path or "/",
            query_params=stream.query_params or [],
            headers=stream.headers or [],
            body_template=stream.body_template,
            pagination=stream.pagination or {},
            records_selector=stream.records_selector,
            max_pages=10000,  # High safety limit - pagination logic will stop when next_url is None
        )

        logger.info(f"Fetched {len(records)} total records from API")

        if not records:
            logger.warning("No records fetched from API")
            return {
                "packages_created": 0,
                "packages_skipped": 0,
            }

        # Convert records to newline-delimited JSON
        ndjson_content = "\n".join(json.dumps(record) for record in records)

        # Get the current revision of the topic
        current_revision = stream.topic.current_revision
        if not current_revision:
            logger.warning(f"Topic {stream.topic.name} has no revisions")
            raise ValueError(f"Topic {stream.topic.name} has no revisions")

        # Generate S3 key (file path) with new format: /packages/t{topic_id}/r{revision_number}/YYYYMMDD/{filename}
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        date_folder = datetime.now().strftime("%Y%m%d")
        filename = f"{timestamp}.ndjson"
        s3_key = f"packages/t{stream.topic.id}/r{current_revision.revision_number}/{date_folder}/{filename}"

        logger.info(f"Uploading {len(records)} records to S3: {s3_key}")

        # Get decrypted S3 credentials
        secret_key = storage_backend.get_decrypted_secret_access_key()

        if not storage_backend.access_key_id or not secret_key:
            error_msg = f"S3 storage backend '{storage_backend.name}' is missing credentials (access_key_id or secret_access_key)"
            logger.error(error_msg)
            raise ValueError(error_msg)

        # Upload to S3
        s3_client = boto3.client(
            "s3",
            endpoint_url=storage_backend.endpoint if storage_backend.endpoint else None,
            region_name=storage_backend.region or "us-east-1",
            aws_access_key_id=storage_backend.access_key_id,
            aws_secret_access_key=secret_key,
        )

        s3_client.put_object(
            Bucket=storage_backend.bucket,
            Key=s3_key,
            Body=ndjson_content.encode("utf-8"),
            ContentType="application/x-ndjson",
        )

        file_size = len(ndjson_content.encode("utf-8"))
        logger.info(f"Successfully uploaded {file_size} bytes to S3")

        # Create data package with timestamp as the name
        package_name = f"{stream.name}_{timestamp}"
        package = DataPackage.objects.create(
            user=stream.user,
            name=package_name,
            topic_revision=current_revision,
            stream=stream,
            destination=storage_backend,
            file_path=s3_key,
            file_size_bytes=file_size,
            status="materialized",
            row_count_estimate=len(records),
        )

        logger.info(f"Created data package: {package.name}")

        return {
            "packages_created": 1,
            "packages_skipped": 0,
            "records_fetched": len(records),
        }

    except Exception as e:
        logger.error(f"Error executing API stream: {e}", exc_info=True)
        raise


@shared_task(name="core.execute_scheduled_streams")
def execute_scheduled_streams():
    """
    DEPRECATED: This task is no longer needed as of the latest version.

    Periodic task to execute all enabled scheduled streams.
    This is called by Celery Beat on a schedule.

    NOTE: Individual Celery Beat periodic tasks are now created for each stream
    with a schedule. This function is kept for backward compatibility but should
    be removed in a future version.
    """
    from core.models import Stream
    from django.utils import timezone

    logger.warning(
        "DEPRECATED: execute_scheduled_streams task is deprecated. "
        "Individual Celery Beat tasks are now created for each scheduled stream."
    )

    logger.info("Running scheduled stream execution task")

    # Get all enabled scheduled streams
    scheduled_streams = Stream.objects.filter(schedule_enabled=True)

    executed_count = 0
    for stream in scheduled_streams:
        try:
            # Check if stream should run based on its schedule
            should_run = _should_stream_run(stream)

            if should_run:
                logger.info(
                    f"Executing scheduled stream: {stream.name} (ID: {stream.id})"
                )
                # Dispatch the execute task
                execute_stream_task.delay(stream.id)
                executed_count += 1
        except Exception as e:
            logger.error(f"Error dispatching scheduled stream {stream.id}: {e}")

    logger.info(f"Dispatched {executed_count} scheduled stream(s)")
    return executed_count


def _should_stream_run(stream):
    """
    DEPRECATED: This function is no longer needed as schedules are handled by Celery Beat.

    Determine if a scheduled stream should run now.
    This is a simplified check - for production, use Celery Beat's cron scheduling.

    For now, we'll use interval-based scheduling only in this function.
    Cron-based scheduling should be configured directly in Celery Beat.
    """
    from core.models import Run
    from django.utils import timezone

    if not stream.schedule_enabled:
        return False

    # If using interval, check last run time
    if stream.schedule_interval_minutes:
        # Get the last successful run
        last_run = (
            Run.objects.filter(stream=stream, status="success")
            .order_by("-completed_at")
            .first()
        )

        if not last_run:
            # No previous run, should run now
            return True

        # Check if enough time has passed
        next_run_time = last_run.completed_at + timedelta(
            minutes=stream.schedule_interval_minutes
        )
        return timezone.now() >= next_run_time

    # For cron-based scheduling, return False here
    # (should be handled by Celery Beat periodic tasks)
    return False


@shared_task(bind=True, name="core.load_data_package_task")
def load_data_package_task(self, model_id, data_package_id, run_id=None):
    """
    Load data from a DataPackage into a Model's ClickHouse table.
    
    This task:
    1. Virtualizes the S3 data using ClickHouse's S3 table function
    2. Performs any transformations (e.g., hash)
    3. Inserts data into the destination table
    4. Uses transactions to ensure atomicity
    
    Args:
        model_id: ID of the Model to load data into
        data_package_id: ID of the DataPackage to load
        run_id: Optional ID of the Run instance to track progress
        
    Returns:
        dict: Loading results including rows loaded
    """
    from core.models import Model, DataPackage, Run, DataSource
    from core.clickhouse_utils import (
        get_clickhouse_client,
        get_s3_table_function,
        detect_file_format,
        get_transformation,
    )
    import hashlib
    
    try:
        # Get the model and data package
        model = Model.objects.select_related("clickhouse_backend", "user").get(id=model_id)
        data_package = DataPackage.objects.select_related(
            "topic_revision", "external_s3_source", "destination"
        ).get(id=data_package_id)
        
        # Get or create Run instance
        if run_id:
            run = Run.objects.get(id=run_id)
        else:
            run = Run.objects.create(
                user=model.user,
                model=model,
                data_package=data_package,
                name=f"Load {data_package.name} into {model.name}",
                status="running",
                started_at=timezone.now(),
            )
        
        # Update run status
        run.status = "running"
        run.started_at = timezone.now()
        run.save()
        
        logger.info(f"Loading data package {data_package_id} into model {model_id} (Run ID: {run.id})")
        
        # Verify model has a table created
        if not model.table_created or not model.table_name:
            error_msg = f"Model {model.name} does not have a table created"
            run.status = "failed"
            run.error_message = error_msg
            run.completed_at = timezone.now()
            run.duration_seconds = int((run.completed_at - run.started_at).total_seconds())
            run.save()
            raise ValueError(error_msg)
        
        # Verify model has a ClickHouse backend
        if not model.clickhouse_backend:
            error_msg = f"Model {model.name} does not have a ClickHouse backend configured"
            run.status = "failed"
            run.error_message = error_msg
            run.completed_at = timezone.now()
            run.duration_seconds = int((run.completed_at - run.started_at).total_seconds())
            run.save()
            raise ValueError(error_msg)
        
        # Verify data package has a file path
        if not data_package.file_path:
            error_msg = f"DataPackage {data_package.name} does not have a file_path"
            run.status = "failed"
            run.error_message = error_msg
            run.completed_at = timezone.now()
            run.duration_seconds = int((run.completed_at - run.started_at).total_seconds())
            run.save()
            raise ValueError(error_msg)
        
        # Get S3 source configuration
        s3_source = data_package.external_s3_source or data_package.destination
        if not s3_source or s3_source.kind != "s3":
            error_msg = f"DataPackage {data_package.name} does not have a valid S3 source"
            run.status = "failed"
            run.error_message = error_msg
            run.completed_at = timezone.now()
            run.duration_seconds = int((run.completed_at - run.started_at).total_seconds())
            run.save()
            raise ValueError(error_msg)
        
        # Get ClickHouse client
        client = get_clickhouse_client(model.clickhouse_backend)
        database = model.clickhouse_backend.database or "default"
        table_name = model.table_name
        
        # Get S3 credentials
        s3_endpoint = s3_source.endpoint
        s3_bucket = s3_source.bucket
        s3_access_key = s3_source.access_key_id
        s3_secret_key = s3_source.get_decrypted_secret_access_key()
        
        if not all([s3_endpoint, s3_bucket, s3_access_key, s3_secret_key]):
            error_msg = f"S3 source {s3_source.name} is missing required configuration"
            run.status = "failed"
            run.error_message = error_msg
            run.completed_at = timezone.now()
            run.duration_seconds = int((run.completed_at - run.started_at).total_seconds())
            run.save()
            raise ValueError(error_msg)
        
        # Detect file format
        file_format = detect_file_format(data_package.file_path)
        
        # Get S3 table function
        s3_table_func = get_s3_table_function(
            s3_endpoint,
            s3_access_key,
            s3_secret_key,
            s3_bucket,
            data_package.file_path,
            file_format,
        )
        
        logger.info(f"Using S3 table function: {s3_table_func}")
        
        # Get field mappings from model
        if model.type == "data_vault":
            entity = model.hubs[0] if model.hubs else (
                model.links[0] if model.links else (
                    model.satellites[0] if model.satellites else None
                )
            )
        else:
            entity = model.facts[0] if model.facts else (
                model.dimensions[0] if model.dimensions else None
            )
        
        if not entity:
            error_msg = f"Model {model.name} has no entities defined"
            run.status = "failed"
            run.error_message = error_msg
            run.completed_at = timezone.now()
            run.duration_seconds = int((run.completed_at - run.started_at).total_seconds())
            run.save()
            raise ValueError(error_msg)
        
        field_mappings = entity.get("field_mappings", [])
        
        # Build SELECT statement with transformations
        select_columns = []
        processed_fields = set()  # Track which fields we've already added
        
        # Determine the hash key field name from mappings
        hash_key_field = None
        business_key_source = None
        for mapping in field_mappings:
            transform = get_transformation(mapping)
            if transform and transform.startswith("hash"):
                hash_key_field = mapping.get("model_field")
                business_key_source = mapping.get("topic_field")
                break
        
        # For Data Vault hubs, calculate the hash key if found in mappings
        if model.type == "data_vault" and model.hubs and hash_key_field and business_key_source:
            # Hash the business key using MD5 (ClickHouse function)
            select_columns.append(f"MD5(toString({business_key_source})) as {hash_key_field}")
            processed_fields.add(hash_key_field)
        
        # Add standard columns if they're not in the field mappings
        has_load_datetime = any(m.get("model_field") == "load_datetime" for m in field_mappings)
        has_record_source = any(m.get("model_field") == "record_source" for m in field_mappings)
        
        if not has_load_datetime:
            select_columns.append(f"now64(3) as load_datetime")
            processed_fields.add("load_datetime")
        
        if not has_record_source:
            select_columns.append(f"'{data_package.name}' as record_source")
            processed_fields.add("record_source")
        
        # Add mapped fields with transformations
        for mapping in field_mappings:
            topic_field = mapping.get("topic_field")
            model_field = mapping.get("model_field")
            transform = get_transformation(mapping)
            
            if not topic_field or not model_field:
                continue
            
            # Skip if we've already processed this field (e.g., hash key)
            if model_field in processed_fields:
                continue
            
            # Apply transformation if specified
            if transform and transform.startswith("hash"):
                select_columns.append(f"MD5(toString({topic_field})) as {model_field}")
            else:
                select_columns.append(f"{topic_field} as {model_field}")
            
            processed_fields.add(model_field)
        
        # Build INSERT INTO SELECT statement
        select_sql = ",\n        ".join(select_columns)
        insert_sql = f"""
        INSERT INTO {database}.{table_name}
        SELECT
            {select_sql}
        FROM {s3_table_func}
        """
        
        logger.info(f"Executing INSERT statement:\n{insert_sql}")
        
        # Execute the INSERT in a transaction-like manner
        # ClickHouse doesn't have traditional transactions, but inserts are atomic
        try:
            result = client.command(insert_sql)
            
            # Query to get the count of rows inserted
            count_sql = f"SELECT count() FROM {database}.{table_name} WHERE record_source = '{data_package.name}'"
            rows_loaded = client.command(count_sql)
            
            logger.info(f"Successfully loaded {rows_loaded} rows from {data_package.name}")
            
            # Update run with success
            run.status = "success"
            run.completed_at = timezone.now()
            run.duration_seconds = int((run.completed_at - run.started_at).total_seconds())
            run.rows_processed = rows_loaded
            run.save()
            
            return {
                "status": "success",
                "rows_loaded": rows_loaded,
                "model_id": model_id,
                "data_package_id": data_package_id,
                "table_name": table_name,
            }
            
        except Exception as insert_error:
            logger.error(f"Error during INSERT: {str(insert_error)}")
            
            # For ClickHouse, we can't really rollback since it's not a traditional transaction
            # But we can delete the rows we just inserted by record_source
            try:
                delete_sql = f"ALTER TABLE {database}.{table_name} DELETE WHERE record_source = '{data_package.name}'"
                client.command(delete_sql)
                logger.info(f"Rolled back inserted rows for {data_package.name}")
            except Exception as rollback_error:
                logger.error(f"Error during rollback: {str(rollback_error)}")
            
            raise insert_error
        
    except Exception as e:
        logger.error(f"Error loading data package {data_package_id}: {str(e)}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        
        # Update run with failure
        if 'run' in locals():
            run.status = "failed"
            run.error_message = str(e)
            run.completed_at = timezone.now()
            run.duration_seconds = int((run.completed_at - run.started_at).total_seconds())
            run.save()
        
        raise
