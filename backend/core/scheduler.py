"""
Scheduler for running streams on schedules using APScheduler.
"""
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from django.core.management import call_command
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

# Global scheduler instance
scheduler = None


def get_scheduler():
    """Get or create the global scheduler instance."""
    global scheduler
    if scheduler is None:
        scheduler = BackgroundScheduler()
        scheduler.start()
        logger.info("APScheduler started")
    return scheduler


def schedule_stream(stream):
    """
    Schedule a stream to run based on its schedule configuration.
    
    Args:
        stream: Stream model instance
    """
    if not stream.schedule_enabled:
        return
    
    sched = get_scheduler()
    job_id = f"stream_{stream.id}"
    
    # Remove existing job if it exists
    if sched.get_job(job_id):
        sched.remove_job(job_id)
    
    # Determine trigger
    trigger = None
    if stream.schedule_cron:
        # Cron-based schedule
        try:
            trigger = CronTrigger.from_crontab(stream.schedule_cron)
            logger.info(f"Scheduling stream {stream.id} with cron: {stream.schedule_cron}")
        except Exception as e:
            logger.error(f"Invalid cron expression for stream {stream.id}: {e}")
            return
    elif stream.schedule_interval_minutes:
        # Interval-based schedule
        trigger = IntervalTrigger(minutes=stream.schedule_interval_minutes)
        logger.info(f"Scheduling stream {stream.id} with interval: {stream.schedule_interval_minutes}m")
    else:
        logger.warning(f"Stream {stream.id} has schedule enabled but no cron or interval specified")
        return
    
    # Add job
    sched.add_job(
        func=execute_stream_job,
        trigger=trigger,
        id=job_id,
        args=[stream.id],
        replace_existing=True,
        max_instances=1  # Prevent overlapping executions
    )
    
    logger.info(f"Stream {stream.id} scheduled successfully")


def unschedule_stream(stream_id):
    """Remove a stream from the scheduler."""
    sched = get_scheduler()
    job_id = f"stream_{stream_id}"
    
    if sched.get_job(job_id):
        sched.remove_job(job_id)
        logger.info(f"Unscheduled stream {stream_id}")


def execute_stream_job(stream_id):
    """Execute a stream (called by scheduler)."""
    logger.info(f"Executing scheduled stream {stream_id}")
    try:
        call_command('execute_stream', stream_id)
        logger.info(f"Successfully executed stream {stream_id}")
    except Exception as e:
        logger.error(f"Error executing stream {stream_id}: {e}", exc_info=True)


def reload_all_schedules():
    """Reload all scheduled streams from the database."""
    from core.models import Stream
    
    logger.info("Reloading all stream schedules")
    
    # Get all enabled scheduled streams
    scheduled_streams = Stream.objects.filter(schedule_enabled=True)
    
    for stream in scheduled_streams:
        schedule_stream(stream)
    
    logger.info(f"Loaded {scheduled_streams.count()} scheduled stream(s)")


def shutdown_scheduler():
    """Shutdown the scheduler gracefully."""
    global scheduler
    if scheduler is not None:
        scheduler.shutdown()
        scheduler = None
        logger.info("APScheduler shut down")
