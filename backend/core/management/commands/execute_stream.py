"""
Django management command to execute a stream and create data packages.
"""
from django.core.management.base import BaseCommand, CommandError
from core.models import Stream, DataPackage, DataSource
from core.s3_utils import S3FileDiscovery
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Execute a stream and create data packages from discovered files'

    def add_arguments(self, parser):
        parser.add_argument(
            'stream_id',
            type=int,
            help='ID of the stream to execute'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be done without creating data packages'
        )

    def handle(self, *args, **options):
        stream_id = options['stream_id']
        dry_run = options.get('dry_run', False)

        try:
            stream = Stream.objects.select_related('data_source', 'topic').get(id=stream_id)
        except Stream.DoesNotExist:
            raise CommandError(f'Stream with id {stream_id} does not exist')

        self.stdout.write(f'Executing stream: {stream.name} (ID: {stream.id})')

        # Only S3 sources supported for now
        if stream.data_source.type != 's3':
            raise CommandError(f'Unsupported data source type: {stream.data_source.type}. Only S3 is supported.')

        if not stream.topic:
            raise CommandError(f'Stream {stream.name} does not have a topic assigned')

        # Execute based on source type
        if stream.data_source.type == 's3':
            self._execute_s3_stream(stream, dry_run)

    def _execute_s3_stream(self, stream: Stream, dry_run: bool):
        """Execute an S3 stream - discover files and create data packages."""
        data_source = stream.data_source
        
        self.stdout.write(f'  Data Source: {data_source.name}')
        self.stdout.write(f'  Bucket: {data_source.s3_bucket}')
        self.stdout.write(f'  Path Pattern: {stream.s3_path_pattern}')
        self.stdout.write(f'  Topic: {stream.topic.name}')
        
        try:
            # Initialize S3 client
            s3_discovery = S3FileDiscovery(
                endpoint_url=data_source.s3_endpoint,
                region=data_source.s3_region or 'us-east-1',
                access_key=data_source.s3_access_key,
                secret_key=data_source.get_decrypted_s3_secret_key()
            )
            
            # Discover files
            files = s3_discovery.list_files(
                bucket=data_source.s3_bucket,
                path_pattern=stream.s3_path_pattern,
                max_files=1000  # Limit to 1000 files per execution
            )
            
            self.stdout.write(self.style.SUCCESS(f'  Found {len(files)} file(s) matching pattern'))
            
            if dry_run:
                self.stdout.write(self.style.WARNING('  DRY RUN - No data packages will be created'))
                for file in files[:10]:  # Show first 10
                    self.stdout.write(f'    - {file["key"]} ({file["size"]} bytes)')
                if len(files) > 10:
                    self.stdout.write(f'    ... and {len(files) - 10} more')
                return
            
            # Create data packages for each file
            created_count = 0
            skipped_count = 0
            
            for file in files:
                # Check if package already exists for this file
                existing = DataPackage.objects.filter(
                    stream=stream,
                    file_path=file['key']
                ).first()
                
                if existing:
                    skipped_count += 1
                    continue
                
                # Create data package
                package_name = f"{stream.name}_{file['key'].split('/')[-1]}"
                
                # Get the current revision of the topic
                current_revision = stream.topic.current_revision
                if not current_revision:
                    self.stdout.write(self.style.WARNING(f'  Topic {stream.topic.name} has no revisions, skipping'))
                    continue
                
                package = DataPackage.objects.create(
                    user=stream.user,
                    name=package_name,
                    topic_revision=current_revision,
                    stream=stream,
                    file_path=file['key'],
                    file_size_bytes=file['size'],
                    status='materialized'  # S3 files already exist
                )
                
                created_count += 1
                self.stdout.write(f'    Created: {package.name}')
            
            self.stdout.write(self.style.SUCCESS(
                f'  Created {created_count} data package(s), skipped {skipped_count} existing'
            ))
            
        except ValueError as e:
            raise CommandError(f'Error accessing S3: {e}')
        except Exception as e:
            logger.exception(f'Error executing S3 stream: {e}')
            raise CommandError(f'Unexpected error: {e}')
