"""
Django management command to execute a stream and create data packages.
"""

from django.core.management.base import BaseCommand, CommandError
from core.models import Stream, DataPackage, DataSource, Run
from core.s3_utils import S3FileDiscovery
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Execute a stream and create data packages from discovered files"

    def add_arguments(self, parser):
        parser.add_argument("stream_id", type=int, help="ID of the stream to execute")
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be done without creating data packages",
        )
        parser.add_argument(
            "--run-id",
            type=int,
            help="ID of the Run instance to track this execution",
        )

    def handle(self, *args, **options):
        stream_id = options["stream_id"]
        dry_run = options.get("dry_run", False)
        run_id = options.get("run_id")

        try:
            stream = Stream.objects.select_related("data_source", "topic").get(
                id=stream_id
            )
        except Stream.DoesNotExist:
            raise CommandError(f"Stream with id {stream_id} does not exist")

        self.stdout.write(f"Executing stream: {stream.name} (ID: {stream.id})")

        # Only S3 sources supported for now
        if stream.data_source.type != "s3":
            raise CommandError(
                f"Unsupported data source type: {stream.data_source.type}. Only S3 is supported."
            )

        if not stream.topic:
            raise CommandError(f"Stream {stream.name} does not have a topic assigned")

        # Get or create Run instance if not dry run
        run = None
        if not dry_run:
            if run_id:
                try:
                    run = Run.objects.get(id=run_id)
                    run.status = "running"
                    run.started_at = timezone.now()
                    run.save()
                except Run.DoesNotExist:
                    self.stdout.write(
                        self.style.WARNING(
                            f"Run with id {run_id} not found, creating new one"
                        )
                    )
                    run = None

            if not run:
                run = Run.objects.create(
                    user=stream.user,
                    stream=stream,
                    name=f"{stream.name} - {timezone.now().strftime('%Y-%m-%d %H:%M:%S')}",
                    status="running",
                    started_at=timezone.now(),
                )

            self.stdout.write(f"  Run ID: {run.id}")

        # Execute based on source type
        try:
            if stream.data_source.type == "s3":
                packages_created = self._execute_s3_stream(stream, dry_run)

            # Update run with success
            if run:
                run.status = "success"
                run.completed_at = timezone.now()
                run.duration_seconds = int(
                    (run.completed_at - run.started_at).total_seconds()
                )
                run.rows_processed = packages_created
                run.save()
                self.stdout.write(self.style.SUCCESS(f"  Run completed successfully"))

        except Exception as e:
            # Update run with failure
            if run:
                run.status = "failed"
                run.error_message = str(e)
                run.completed_at = timezone.now()
                run.duration_seconds = int(
                    (run.completed_at - run.started_at).total_seconds()
                )
                run.save()
            raise

    def _execute_s3_stream(self, stream: Stream, dry_run: bool):
        """Execute an S3 stream - discover files and create data packages."""
        data_source = stream.data_source

        self.stdout.write(f"  Data Source: {data_source.name}")
        self.stdout.write(f"  Bucket: {data_source.s3_bucket}")
        self.stdout.write(f"  Path Pattern: {stream.s3_path_pattern}")
        self.stdout.write(f"  Topic: {stream.topic.name}")

        try:
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

            self.stdout.write(
                self.style.SUCCESS(f"  Found {len(files)} file(s) matching pattern")
            )

            if dry_run:
                self.stdout.write(
                    self.style.WARNING("  DRY RUN - No data packages will be created")
                )
                for file in files[:10]:  # Show first 10
                    self.stdout.write(f'    - {file["key"]} ({file["size"]} bytes)')
                if len(files) > 10:
                    self.stdout.write(f"    ... and {len(files) - 10} more")
                return 0

            # Create data packages for each file
            created_count = 0
            skipped_count = 0

            for file in files:
                # Check if package already exists for this file (prevent duplicates)
                existing = DataPackage.objects.filter(
                    stream=stream, file_path=file["key"]
                ).first()

                if existing:
                    skipped_count += 1
                    continue

                # Use the original file name (without path) as the package name
                package_name = file["key"].split("/")[-1]

                # Get the current revision of the topic
                current_revision = stream.topic.current_revision
                if not current_revision:
                    self.stdout.write(
                        self.style.WARNING(
                            f"  Topic {stream.topic.name} has no revisions, skipping"
                        )
                    )
                    continue

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
                self.stdout.write(f"    Created: {package.name}")

            self.stdout.write(
                self.style.SUCCESS(
                    f"  Created {created_count} data package(s), skipped {skipped_count} existing"
                )
            )

            return created_count

        except ValueError as e:
            raise CommandError(f"Error accessing S3: {e}")
        except Exception as e:
            logger.exception(f"Error executing S3 stream: {e}")
            raise CommandError(f"Unexpected error: {e}")
