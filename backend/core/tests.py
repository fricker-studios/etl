from django.test import TestCase
from django.contrib.auth.models import User
from unittest.mock import Mock, patch, MagicMock
from io import StringIO
from django.core.management import call_command
from .models import DataSource, Stream, DataPackage, Topic, TopicRevision


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
