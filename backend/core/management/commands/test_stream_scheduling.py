"""
Management command to test Stream scheduling with Celery Beat.
"""

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from core.models import DataSource, Stream, Topic
from django_celery_beat.models import PeriodicTask
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Test Stream scheduling integration with Celery Beat"

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("\n=== Testing Stream Scheduling Integration ===\n"))

        # Get or create test user
        user, _ = User.objects.get_or_create(
            username="test_scheduler",
            defaults={"email": "test@example.com"}
        )

        # Get or create test data source
        data_source, _ = DataSource.objects.get_or_create(
            user=user,
            name="Test S3 Source",
            defaults={
                "type": "s3",
                "s3_endpoint": "https://s3.amazonaws.com",
                "s3_region": "us-east-1",
                "s3_bucket": "test-bucket",
                "s3_access_key": "test-key",
                "s3_secret_key": "test-secret",
            }
        )

        # Get or create test topic
        topic, _ = Topic.objects.get_or_create(
            user=user,
            name="Test Topic",
            defaults={"description": "Test topic for scheduling"}
        )

        self.stdout.write("Test setup complete.\n")

        # Test 1: Create stream with interval schedule
        self.stdout.write(self.style.WARNING("Test 1: Create stream with interval schedule"))
        stream1 = Stream.objects.create(
            user=user,
            name="Interval Test Stream",
            data_source=data_source,
            topic=topic,
            schedule_enabled=True,
            schedule_interval_minutes=15,
        )
        
        task_name = f"stream_{stream1.id}"
        task = PeriodicTask.objects.filter(name=task_name).first()
        
        if task and task.interval and task.interval.every == 15:
            self.stdout.write(self.style.SUCCESS(f"✓ Periodic task created: {task_name}"))
            self.stdout.write(f"  - Interval: {task.interval.every} minutes")
        else:
            self.stdout.write(self.style.ERROR(f"✗ Failed to create periodic task"))

        # Test 2: Create stream with cron schedule
        self.stdout.write(self.style.WARNING("\nTest 2: Create stream with cron schedule"))
        stream2 = Stream.objects.create(
            user=user,
            name="Cron Test Stream",
            data_source=data_source,
            topic=topic,
            schedule_enabled=True,
            schedule_cron="0 2 * * *",  # Daily at 2 AM
        )
        
        task_name = f"stream_{stream2.id}"
        task = PeriodicTask.objects.filter(name=task_name).first()
        
        if task and task.crontab:
            self.stdout.write(self.style.SUCCESS(f"✓ Periodic task created: {task_name}"))
            self.stdout.write(f"  - Cron: {task.crontab.minute} {task.crontab.hour} {task.crontab.day_of_month} {task.crontab.month_of_year} {task.crontab.day_of_week}")
        else:
            self.stdout.write(self.style.ERROR(f"✗ Failed to create periodic task"))

        # Test 3: Update schedule
        self.stdout.write(self.style.WARNING("\nTest 3: Update schedule from interval to cron"))
        stream1.schedule_interval_minutes = None
        stream1.schedule_cron = "*/30 * * * *"  # Every 30 minutes
        stream1.save()
        
        task_name = f"stream_{stream1.id}"
        task = PeriodicTask.objects.filter(name=task_name).first()
        
        if task and task.crontab and task.crontab.minute == "*/30":
            self.stdout.write(self.style.SUCCESS(f"✓ Periodic task updated to cron schedule"))
            self.stdout.write(f"  - Cron: {task.crontab.minute} {task.crontab.hour} {task.crontab.day_of_month} {task.crontab.month_of_year} {task.crontab.day_of_week}")
        else:
            self.stdout.write(self.style.ERROR(f"✗ Failed to update periodic task"))

        # Test 4: Disable schedule
        self.stdout.write(self.style.WARNING("\nTest 4: Disable schedule"))
        stream1.schedule_enabled = False
        stream1.save()
        
        task_name = f"stream_{stream1.id}"
        task = PeriodicTask.objects.filter(name=task_name).first()
        
        if not task:
            self.stdout.write(self.style.SUCCESS(f"✓ Periodic task deleted when schedule disabled"))
        else:
            self.stdout.write(self.style.ERROR(f"✗ Failed to delete periodic task"))

        # Test 5: Delete stream
        self.stdout.write(self.style.WARNING("\nTest 5: Delete stream"))
        task_name = f"stream_{stream2.id}"
        stream2.delete()
        
        task = PeriodicTask.objects.filter(name=task_name).first()
        
        if not task:
            self.stdout.write(self.style.SUCCESS(f"✓ Periodic task deleted when stream deleted"))
        else:
            self.stdout.write(self.style.ERROR(f"✗ Failed to delete periodic task on stream deletion"))

        # Test 6: Rename stream
        self.stdout.write(self.style.WARNING("\nTest 6: Rename stream and verify task persists"))
        stream1.schedule_enabled = True
        stream1.schedule_interval_minutes = 20
        stream1.schedule_cron = None  # Clear cron to use interval
        stream1.save()
        
        # Get original task name
        original_task_name = f"stream_{stream1.id}"
        
        # Rename stream
        stream1.name = "Renamed Stream"
        stream1.save()
        
        # Task name should still be based on ID only
        task_name = f"stream_{stream1.id}"
        task = PeriodicTask.objects.filter(name=task_name).first()
        
        if task and task.interval and task.interval.every == 20:
            self.stdout.write(self.style.SUCCESS(f"✓ Periodic task persists after stream rename"))
            self.stdout.write(f"  - Task name unchanged: {task_name}")
        else:
            self.stdout.write(self.style.ERROR(f"✗ Failed to maintain task after rename"))

        # Clean up
        stream1.delete()
        
        self.stdout.write(self.style.SUCCESS("\n=== All tests completed ===\n"))
