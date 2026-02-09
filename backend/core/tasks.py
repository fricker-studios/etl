"""
Celery tasks for ETL operations.
"""
from celery import shared_task
from django.utils import timezone
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)


@shared_task(bind=True, name='core.execute_stream_task')
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
        stream = Stream.objects.select_related('data_source', 'topic', 'user').get(id=stream_id)
        
        # Get or create Run instance
        if run_id:
            run = Run.objects.get(id=run_id)
        else:
            run = Run.objects.create(
                user=stream.user,
                stream=stream,
                name=f"{stream.name} - {timezone.now().strftime('%Y-%m-%d %H:%M:%S')}",
                status='running',
                started_at=timezone.now()
            )
        
        # Update run status to running
        run.status = 'running'
        run.started_at = timezone.now()
        run.save()
        
        logger.info(f"Executing stream {stream_id} (Run ID: {run.id})")
        
        # Only S3 sources supported for now
        if stream.data_source.type != "s3":
            error_msg = f"Unsupported data source type: {stream.data_source.type}. Only S3 is supported."
            run.status = 'failed'
            run.error_message = error_msg
            run.completed_at = timezone.now()
            run.duration_seconds = int((run.completed_at - run.started_at).total_seconds())
            run.save()
            raise ValueError(error_msg)
        
        if not stream.topic:
            error_msg = f"Stream {stream.name} does not have a topic assigned"
            run.status = 'failed'
            run.error_message = error_msg
            run.completed_at = timezone.now()
            run.duration_seconds = int((run.completed_at - run.started_at).total_seconds())
            run.save()
            raise ValueError(error_msg)
        
        # Execute S3 stream
        result = _execute_s3_stream(stream, run)
        
        # Update run with success
        run.status = 'success'
        run.completed_at = timezone.now()
        run.duration_seconds = int((run.completed_at - run.started_at).total_seconds())
        run.rows_processed = result.get('packages_created', 0)
        run.save()
        
        logger.info(f"Successfully executed stream {stream_id} (Run ID: {run.id})")
        
        return {
            'status': 'success',
            'run_id': run.id,
            'packages_created': result.get('packages_created', 0),
            'packages_skipped': result.get('packages_skipped', 0),
        }
        
    except Exception as e:
        logger.error(f"Error executing stream {stream_id}: {e}", exc_info=True)
        
        # Update run with failure
        if 'run' in locals():
            run.status = 'failed'
            run.error_message = str(e)
            run.completed_at = timezone.now()
            run.duration_seconds = int((run.completed_at - run.started_at).total_seconds())
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
            stream=stream,
            file_path=file["key"]
        ).first()
        
        if existing:
            logger.debug(f"Skipping existing package: {file['key']}")
            skipped_count += 1
            continue
        
        # Use the original file name (without path) as the package name
        package_name = file['key'].split('/')[-1]
        
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
        'packages_created': created_count,
        'packages_skipped': skipped_count,
    }


@shared_task(name='core.execute_scheduled_streams')
def execute_scheduled_streams():
    """
    Periodic task to execute all enabled scheduled streams.
    This is called by Celery Beat on a schedule.
    """
    from core.models import Stream
    from django.utils import timezone
    
    logger.info("Running scheduled stream execution task")
    
    # Get all enabled scheduled streams
    scheduled_streams = Stream.objects.filter(schedule_enabled=True)
    
    executed_count = 0
    for stream in scheduled_streams:
        try:
            # Check if stream should run based on its schedule
            should_run = _should_stream_run(stream)
            
            if should_run:
                logger.info(f"Executing scheduled stream: {stream.name} (ID: {stream.id})")
                # Dispatch the execute task
                execute_stream_task.delay(stream.id)
                executed_count += 1
        except Exception as e:
            logger.error(f"Error dispatching scheduled stream {stream.id}: {e}")
    
    logger.info(f"Dispatched {executed_count} scheduled stream(s)")
    return executed_count


def _should_stream_run(stream):
    """
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
        last_run = Run.objects.filter(
            stream=stream,
            status='success'
        ).order_by('-completed_at').first()
        
        if not last_run:
            # No previous run, should run now
            return True
        
        # Check if enough time has passed
        next_run_time = last_run.completed_at + timedelta(minutes=stream.schedule_interval_minutes)
        return timezone.now() >= next_run_time
    
    # For cron-based scheduling, return False here
    # (should be handled by Celery Beat periodic tasks)
    return False
