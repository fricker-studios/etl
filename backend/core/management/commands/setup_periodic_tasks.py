"""
Django management command to set up periodic tasks for scheduled streams.
"""

from django.core.management.base import BaseCommand
from django_celery_beat.models import PeriodicTask, IntervalSchedule, CrontabSchedule
import json
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Set up Celery Beat periodic tasks for stream scheduling"

    def handle(self, *args, **options):
        self.stdout.write("Setting up periodic tasks for stream scheduling...")

        # Create or get the interval schedule for checking streams (every 5 minutes)
        schedule, created = IntervalSchedule.objects.get_or_create(
            every=5,
            period=IntervalSchedule.MINUTES,
        )

        if created:
            self.stdout.write(
                self.style.SUCCESS("  Created interval schedule: 5 minutes")
            )
        else:
            self.stdout.write("  Using existing interval schedule: 5 minutes")

        # Create or update the periodic task
        task, created = PeriodicTask.objects.get_or_create(
            name="Execute Scheduled Streams",
            defaults={
                "interval": schedule,
                "task": "core.execute_scheduled_streams",
                "enabled": True,
            },
        )

        if not created:
            # Update existing task
            task.interval = schedule
            task.task = "core.execute_scheduled_streams"
            task.enabled = True
            task.save()
            self.stdout.write(
                self.style.SUCCESS("  Updated periodic task: Execute Scheduled Streams")
            )
        else:
            self.stdout.write(
                self.style.SUCCESS("  Created periodic task: Execute Scheduled Streams")
            )

        self.stdout.write(self.style.SUCCESS("\nPeriodic tasks set up successfully!"))
        self.stdout.write("Scheduled streams will be checked every 5 minutes.")
