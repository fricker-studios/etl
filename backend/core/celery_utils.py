"""
Utilities for managing Celery Beat periodic tasks for scheduled streams.
"""

from django_celery_beat.models import PeriodicTask, CrontabSchedule, IntervalSchedule
import json
import logging

logger = logging.getLogger(__name__)


def create_or_update_stream_task(stream):
    """
    Create or update a Celery Beat periodic task for a scheduled stream.
    
    Args:
        stream: Stream instance with schedule configuration
        
    Returns:
        PeriodicTask instance if schedule is enabled, None otherwise
    """
    task_name = f"stream_{stream.id}_{stream.name}"
    
    # If schedule is disabled, delete any existing task
    if not stream.schedule_enabled:
        delete_stream_task(stream)
        return None
    
    # Determine schedule type and get/create schedule object
    schedule_obj = None
    schedule_type = None
    
    if stream.schedule_cron:
        # Parse cron expression (format: "minute hour day month day_of_week")
        try:
            parts = stream.schedule_cron.strip().split()
            if len(parts) != 5:
                logger.error(f"Invalid cron format for stream {stream.id}: {stream.schedule_cron}")
                return None
            
            minute, hour, day_of_month, month_of_year, day_of_week = parts
            
            schedule_obj, _ = CrontabSchedule.objects.get_or_create(
                minute=minute,
                hour=hour,
                day_of_week=day_of_week,
                day_of_month=day_of_month,
                month_of_year=month_of_year,
            )
            schedule_type = "crontab"
            logger.info(f"Created/retrieved cron schedule for stream {stream.id}: {stream.schedule_cron}")
        except Exception as e:
            logger.error(f"Error parsing cron expression for stream {stream.id}: {e}")
            return None
            
    elif stream.schedule_interval_minutes:
        # Use interval schedule
        schedule_obj, _ = IntervalSchedule.objects.get_or_create(
            every=stream.schedule_interval_minutes,
            period=IntervalSchedule.MINUTES,
        )
        schedule_type = "interval"
        logger.info(f"Created/retrieved interval schedule for stream {stream.id}: {stream.schedule_interval_minutes} minutes")
    else:
        logger.warning(f"Stream {stream.id} has schedule_enabled=True but no schedule defined")
        return None
    
    # Create or update the periodic task
    task_data = {
        "task": "core.execute_stream_task",
        "args": json.dumps([stream.id]),
        "enabled": True,
    }
    
    # Set the appropriate schedule field
    if schedule_type == "crontab":
        task_data["crontab"] = schedule_obj
        task_data["interval"] = None
    else:  # interval
        task_data["interval"] = schedule_obj
        task_data["crontab"] = None
    
    task, created = PeriodicTask.objects.update_or_create(
        name=task_name,
        defaults=task_data,
    )
    
    if created:
        logger.info(f"Created periodic task for stream {stream.id}: {task_name}")
    else:
        logger.info(f"Updated periodic task for stream {stream.id}: {task_name}")
    
    return task


def delete_stream_task(stream):
    """
    Delete the Celery Beat periodic task for a stream.
    
    Args:
        stream: Stream instance
    """
    task_name = f"stream_{stream.id}_{stream.name}"
    
    deleted_count, _ = PeriodicTask.objects.filter(name=task_name).delete()
    
    if deleted_count > 0:
        logger.info(f"Deleted periodic task for stream {stream.id}: {task_name}")
    
    return deleted_count > 0
