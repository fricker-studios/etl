from django.test import TestCase
from django.contrib.auth.models import User
from unittest.mock import Mock, patch, MagicMock
from io import StringIO
from django.core.management import call_command
from .models import DataSource, Stream, DataPackage, Topic, TopicRevision, StorageBackend


class DataPackageModelTests(TestCase):
    """Tests for the DataPackage model."""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.data_source = DataSource.objects.create(
            user=self.user,
            name="Test S3 Source",
            type="s3",
            s3_endpoint="https://s3.amazonaws.com",
            s3_region="us-east-1",
            s3_bucket="test-bucket",
            s3_access_key="test-key",
            s3_secret_key="test-secret",
        )
        self.topic = Topic.objects.create(
            user=self.user,
            name="Test Topic",
            description="Test topic for packages",
        )
        self.topic_revision = TopicRevision.objects.create(
            topic=self.topic, revision_number=1, schema=[]
        )

    def test_data_package_with_external_s3_source(self):
        """Test creating a data package with an external S3 source reference."""
        package = DataPackage.objects.create(
            user=self.user,
            name="test-file.parquet",
            topic_revision=self.topic_revision,
            file_path="data/test-file.parquet",
            file_size_bytes=1024,
            status="materialized",
            external_s3_source=self.data_source,
        )

        self.assertEqual(package.name, "test-file.parquet")
        self.assertEqual(package.external_s3_source, self.data_source)
        self.assertEqual(package.file_path, "data/test-file.parquet")
        self.assertEqual(package.file_size_bytes, 1024)

    def test_data_package_without_external_s3_source(self):
        """Test creating a data package without an external S3 source reference."""
        package = DataPackage.objects.create(
            user=self.user,
            name="generated-package",
            topic_revision=self.topic_revision,
            status="draft",
        )

        self.assertEqual(package.name, "generated-package")
        self.assertIsNone(package.external_s3_source)

    def test_external_s3_source_cascade_on_delete(self):
        """Test that data packages are preserved when external S3 source is deleted."""
        package = DataPackage.objects.create(
            user=self.user,
            name="test-file.parquet",
            topic_revision=self.topic_revision,
            external_s3_source=self.data_source,
        )

        # Delete the data source
        self.data_source.delete()

        # Package should still exist with external_s3_source set to None
        package.refresh_from_db()
        self.assertIsNone(package.external_s3_source)


class ExecuteStreamCommandTests(TestCase):
    """Tests for the execute_stream management command."""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.data_source = DataSource.objects.create(
            user=self.user,
            name="Test S3 Source",
            type="s3",
            s3_endpoint="https://s3.amazonaws.com",
            s3_region="us-east-1",
            s3_bucket="test-bucket",
            s3_access_key="test-key",
            s3_secret_key="test-secret",
        )
        self.topic = Topic.objects.create(
            user=self.user,
            name="Test Topic",
            description="Test topic for packages",
        )
        self.topic_revision = TopicRevision.objects.create(
            topic=self.topic, revision_number=1, schema=[]
        )
        self.stream = Stream.objects.create(
            user=self.user,
            name="Test Stream",
            data_source=self.data_source,
            topic=self.topic,
            s3_path_pattern="data/*.parquet",
            s3_file_format="parquet",
        )

    @patch("core.management.commands.execute_stream.S3FileDiscovery")
    def test_execute_stream_retains_original_filename(self, mock_s3_discovery):
        """Test that execute_stream uses the original file name from S3."""
        # Mock S3 file discovery
        mock_discovery = Mock()
        mock_discovery.list_files.return_value = [
            {
                "key": "data/my-original-file.parquet",
                "size": 2048,
                "last_modified": "2024-01-01T00:00:00",
            }
        ]
        mock_s3_discovery.return_value = mock_discovery

        # Execute the command
        out = StringIO()
        call_command("execute_stream", self.stream.id, stdout=out)

        # Check that the package was created with the original filename
        package = DataPackage.objects.get(stream=self.stream)
        self.assertEqual(package.name, "my-original-file.parquet")
        self.assertNotIn(self.stream.name, package.name)

    @patch("core.management.commands.execute_stream.S3FileDiscovery")
    def test_execute_stream_stores_external_s3_source(self, mock_s3_discovery):
        """Test that execute_stream stores the external S3 source reference."""
        # Mock S3 file discovery
        mock_discovery = Mock()
        mock_discovery.list_files.return_value = [
            {
                "key": "data/test-file.parquet",
                "size": 1024,
                "last_modified": "2024-01-01T00:00:00",
            }
        ]
        mock_s3_discovery.return_value = mock_discovery

        # Execute the command
        out = StringIO()
        call_command("execute_stream", self.stream.id, stdout=out)

        # Check that the package has the external S3 source reference
        package = DataPackage.objects.get(stream=self.stream)
        self.assertEqual(package.external_s3_source, self.data_source)

    @patch("core.management.commands.execute_stream.S3FileDiscovery")
    def test_execute_stream_with_nested_path(self, mock_s3_discovery):
        """Test that execute_stream correctly extracts filename from nested paths."""
        # Mock S3 file discovery
        mock_discovery = Mock()
        mock_discovery.list_files.return_value = [
            {
                "key": "data/year=2024/month=01/day=15/complex-file-name.parquet",
                "size": 4096,
                "last_modified": "2024-01-01T00:00:00",
            }
        ]
        mock_s3_discovery.return_value = mock_discovery

        # Execute the command
        out = StringIO()
        call_command("execute_stream", self.stream.id, stdout=out)

        # Check that only the filename is used, not the full path
        package = DataPackage.objects.get(stream=self.stream)
        self.assertEqual(package.name, "complex-file-name.parquet")
        self.assertEqual(package.file_path, "data/year=2024/month=01/day=15/complex-file-name.parquet")

    @patch("core.management.commands.execute_stream.S3FileDiscovery")
    def test_execute_stream_multiple_files(self, mock_s3_discovery):
        """Test that execute_stream creates packages for multiple files with correct names."""
        # Mock S3 file discovery
        mock_discovery = Mock()
        mock_discovery.list_files.return_value = [
            {"key": "data/file1.parquet", "size": 1024, "last_modified": "2024-01-01T00:00:00"},
            {"key": "data/file2.parquet", "size": 2048, "last_modified": "2024-01-01T00:00:00"},
            {"key": "data/file3.parquet", "size": 3072, "last_modified": "2024-01-01T00:00:00"},
        ]
        mock_s3_discovery.return_value = mock_discovery

        # Execute the command
        out = StringIO()
        call_command("execute_stream", self.stream.id, stdout=out)

        # Check that all packages were created with correct names
        packages = DataPackage.objects.filter(stream=self.stream).order_by("name")
        self.assertEqual(packages.count(), 3)
        self.assertEqual(packages[0].name, "file1.parquet")
        self.assertEqual(packages[1].name, "file2.parquet")
        self.assertEqual(packages[2].name, "file3.parquet")

        # All packages should have the external S3 source reference
        for package in packages:
            self.assertEqual(package.external_s3_source, self.data_source)


class RunTrackingTests(TestCase):
    """Tests for Run instance tracking during stream execution."""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.data_source = DataSource.objects.create(
            user=self.user,
            name="Test S3 Source",
            type="s3",
            s3_endpoint="https://s3.amazonaws.com",
            s3_region="us-east-1",
            s3_bucket="test-bucket",
            s3_access_key="test-key",
            s3_secret_key="test-secret",
        )
        self.topic = Topic.objects.create(
            user=self.user,
            name="Test Topic",
            description="Test topic for packages",
        )
        self.topic_revision = TopicRevision.objects.create(
            topic=self.topic, revision_number=1, schema=[]
        )
        self.stream = Stream.objects.create(
            user=self.user,
            name="Test Stream",
            data_source=self.data_source,
            topic=self.topic,
            s3_path_pattern="data/*.parquet",
            s3_file_format="parquet",
        )

    @patch("core.management.commands.execute_stream.S3FileDiscovery")
    def test_execute_stream_creates_run_instance(self, mock_s3_discovery):
        """Test that execute_stream management command creates a Run instance."""
        from core.models import Run
        
        # Mock S3 file discovery
        mock_discovery = Mock()
        mock_discovery.list_files.return_value = [
            {"key": "data/file1.parquet", "size": 1024, "last_modified": "2024-01-01T00:00:00"},
        ]
        mock_s3_discovery.return_value = mock_discovery

        # Execute the command
        out = StringIO()
        call_command("execute_stream", self.stream.id, stdout=out)

        # Check that a Run instance was created
        run = Run.objects.filter(stream=self.stream).first()
        self.assertIsNotNone(run)
        self.assertEqual(run.status, 'success')
        self.assertIsNotNone(run.started_at)
        self.assertIsNotNone(run.completed_at)
        self.assertIsNotNone(run.duration_seconds)
        self.assertEqual(run.rows_processed, 1)  # 1 package created

    @patch("core.management.commands.execute_stream.S3FileDiscovery")
    def test_execute_stream_with_existing_run_id(self, mock_s3_discovery):
        """Test that execute_stream can use an existing Run instance."""
        from core.models import Run
        from django.utils import timezone
        
        # Create a Run instance
        run = Run.objects.create(
            user=self.user,
            stream=self.stream,
            name="Test Run",
            status='queued',
        )
        
        # Mock S3 file discovery
        mock_discovery = Mock()
        mock_discovery.list_files.return_value = [
            {"key": "data/file1.parquet", "size": 1024, "last_modified": "2024-01-01T00:00:00"},
        ]
        mock_s3_discovery.return_value = mock_discovery

        # Execute the command with existing run_id
        out = StringIO()
        call_command("execute_stream", self.stream.id, run_id=run.id, stdout=out)

        # Check that the Run instance was updated
        run.refresh_from_db()
        self.assertEqual(run.status, 'success')
        self.assertIsNotNone(run.started_at)
        self.assertIsNotNone(run.completed_at)
        self.assertEqual(run.rows_processed, 1)

    @patch("core.management.commands.execute_stream.S3FileDiscovery")
    def test_execute_stream_failure_updates_run(self, mock_s3_discovery):
        """Test that Run instance is updated on failure."""
        from core.models import Run
        
        # Mock S3 file discovery to raise an error
        mock_discovery = Mock()
        mock_discovery.list_files.side_effect = ValueError("S3 connection failed")
        mock_s3_discovery.return_value = mock_discovery

        # Execute the command (should fail)
        out = StringIO()
        with self.assertRaises(Exception):
            call_command("execute_stream", self.stream.id, stdout=out)

        # Check that a Run instance was created and marked as failed
        run = Run.objects.filter(stream=self.stream).first()
        self.assertIsNotNone(run)
        self.assertEqual(run.status, 'failed')
        self.assertIsNotNone(run.error_message)
        self.assertIn("S3 connection failed", run.error_message)

    @patch("core.management.commands.execute_stream.S3FileDiscovery")
    def test_no_duplicate_packages_on_rerun(self, mock_s3_discovery):
        """Test that re-running a stream doesn't create duplicate DataPackages."""
        from core.models import DataPackage
        
        # Mock S3 file discovery
        mock_discovery = Mock()
        mock_discovery.list_files.return_value = [
            {"key": "data/file1.parquet", "size": 1024, "last_modified": "2024-01-01T00:00:00"},
            {"key": "data/file2.parquet", "size": 2048, "last_modified": "2024-01-01T00:00:00"},
        ]
        mock_s3_discovery.return_value = mock_discovery

        # First execution
        out = StringIO()
        call_command("execute_stream", self.stream.id, stdout=out)
        
        # Check packages created
        packages = DataPackage.objects.filter(stream=self.stream)
        self.assertEqual(packages.count(), 2)
        
        # Second execution (should skip existing packages)
        out = StringIO()
        call_command("execute_stream", self.stream.id, stdout=out)
        
        # Check that no duplicate packages were created
        packages = DataPackage.objects.filter(stream=self.stream)
        self.assertEqual(packages.count(), 2)  # Still 2, not 4
        
        # Check the output mentions skipped packages
        output = out.getvalue()
        self.assertIn("skipped 2 existing", output)


class APIStreamExecutionTests(TestCase):
    """Tests for API stream execution functionality."""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")
        
        # Create API data source
        self.api_data_source = DataSource.objects.create(
            user=self.user,
            name="Test API Source",
            type="api",
            base_url="https://api.example.com",
            auth_type="bearer",
            bearer_token="test-token-123",
        )
        
        # Create S3 storage backend
        self.storage_backend = StorageBackend.objects.create(
            user=self.user,
            kind="s3",
            name="Test S3 Storage",
            endpoint="https://s3.amazonaws.com",
            region="us-east-1",
            bucket="test-storage-bucket",
            access_key_id="test-key",
            secret_access_key="test-secret",
        )
        
        # Create topic and revision
        self.topic = Topic.objects.create(
            user=self.user,
            name="Test Topic",
            description="Test topic for API packages",
        )
        self.topic_revision = TopicRevision.objects.create(
            topic=self.topic, revision_number=1, schema=[]
        )
        
        # Create API stream
        self.api_stream = Stream.objects.create(
            user=self.user,
            name="Test API Stream",
            data_source=self.api_data_source,
            topic=self.topic,
            method="GET",
            path="/api/data",
            query_params=[],
            headers=[],
            pagination={"type": "page_number", "page_size": 100},
            records_selector="data",
        )

    @patch("core.api_utils.requests.Session.request")
    @patch("boto3.client")
    def test_execute_api_stream_success(self, mock_boto_client, mock_request):
        """Test successful API stream execution."""
        from core.tasks import execute_stream_task
        from core.models import Run, DataPackage
        
        # Mock API response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": [
                {"id": 1, "name": "Item 1"},
                {"id": 2, "name": "Item 2"},
                {"id": 3, "name": "Item 3"},
            ]
        }
        mock_response.raise_for_status = Mock()
        mock_request.return_value = mock_response
        
        # Mock S3 client
        mock_s3 = Mock()
        mock_boto_client.return_value = mock_s3
        
        # Create Run instance
        run = Run.objects.create(
            user=self.user,
            stream=self.api_stream,
            name="Test Run",
            status='queued',
        )
        
        # Execute the task
        result = execute_stream_task(self.api_stream.id, run.id)
        
        # Verify results
        self.assertEqual(result['status'], 'success')
        self.assertEqual(result['packages_created'], 1)
        self.assertEqual(result['records_fetched'], 3)
        
        # Verify Run was updated
        run.refresh_from_db()
        self.assertEqual(run.status, 'success')
        self.assertEqual(run.rows_processed, 3)
        self.assertIsNotNone(run.completed_at)
        
        # Verify DataPackage was created
        package = DataPackage.objects.filter(stream=self.api_stream).first()
        self.assertIsNotNone(package)
        self.assertEqual(package.status, 'materialized')
        self.assertEqual(package.destination, self.storage_backend)
        self.assertEqual(package.row_count_estimate, 3)
        
        # Verify S3 upload was called
        mock_s3.put_object.assert_called_once()
        call_args = mock_s3.put_object.call_args
        self.assertEqual(call_args[1]['Bucket'], 'test-storage-bucket')
        self.assertIn('api_data/', call_args[1]['Key'])

    @patch("core.api_utils.requests.Session.request")
    def test_execute_api_stream_with_pagination(self, mock_request):
        """Test API stream execution with multiple pages."""
        from core.api_utils import APIClient
        
        # Create factory function to properly capture values
        def make_response(start, end):
            response = Mock(status_code=200)
            response.json = lambda: {"data": [{"id": i} for i in range(start, end)]}
            response.raise_for_status = Mock()
            return response
        
        # Mock two pages of responses
        responses = [
            make_response(1, 101),
            make_response(101, 151),
        ]
        
        mock_request.side_effect = responses
        
        # Create API client and fetch data
        client = APIClient(
            base_url="https://api.example.com",
            auth_type="bearer",
            bearer_token="test-token",
        )
        
        records = client.fetch_paginated_data(
            method="GET",
            path="/api/data",
            pagination={"type": "page_number", "page_size": 100},
            records_selector="data",
        )
        
        # Should have fetched 150 records across 2 pages
        self.assertEqual(len(records), 150)

    def test_execute_api_stream_without_storage_backend(self):
        """Test that API stream execution fails without S3 storage backend."""
        from core.tasks import execute_stream_task
        from core.models import Run
        
        # Delete the storage backend
        self.storage_backend.delete()
        
        # Create Run instance
        run = Run.objects.create(
            user=self.user,
            stream=self.api_stream,
            name="Test Run",
            status='queued',
        )
        
        # Execute should fail
        with self.assertRaises(ValueError) as context:
            execute_stream_task(self.api_stream.id, run.id)
        
        self.assertIn("No S3 storage backend configured", str(context.exception))
        
        # Verify Run was marked as failed
        run.refresh_from_db()
        self.assertEqual(run.status, 'failed')
        self.assertIn("No S3 storage backend", run.error_message)

    def test_api_client_extract_records_with_selector(self):
        """Test extracting records using records selector."""
        from core.api_utils import APIClient
        
        client = APIClient(base_url="https://api.example.com")
        
        # Test with nested selector
        data = {
            "response": {
                "items": [
                    {"id": 1, "name": "Item 1"},
                    {"id": 2, "name": "Item 2"},
                ]
            }
        }
        
        records = client.extract_records(data, "response.items")
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]['id'], 1)

    def test_api_client_extract_records_without_selector(self):
        """Test extracting records without selector (auto-detect)."""
        from core.api_utils import APIClient
        
        client = APIClient(base_url="https://api.example.com")
        
        # Test auto-detection of 'data' key
        data = {
            "data": [
                {"id": 1, "name": "Item 1"},
                {"id": 2, "name": "Item 2"},
            ]
        }
        
        records = client.extract_records(data)
        self.assertEqual(len(records), 2)

