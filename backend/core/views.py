from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from .models import (
    StorageBackend,
    DataSource,
    Stream,
    DataPackage,
    Model,
    Run,
    Topic,
    TopicRevision,
)
from .serializers import (
    StorageBackendSerializer,
    DataSourceSerializer,
    StreamSerializer,
    DataPackageSerializer,
    ModelSerializer,
    RunSerializer,
    TopicSerializer,
    TopicRevisionSerializer,
)
import logging

logger = logging.getLogger(__name__)


class DecryptRateThrottle(UserRateThrottle):
    """Rate limiting for decrypt endpoints - 10 requests per minute"""

    rate = "10/min"


class StorageBackendViewSet(viewsets.ModelViewSet):
    serializer_class = StorageBackendSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return StorageBackend.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class DataSourceViewSet(viewsets.ModelViewSet):
    serializer_class = DataSourceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return DataSource.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["get"], throttle_classes=[DecryptRateThrottle])
    def decrypt(self, request, pk=None):
        """Get decrypted sensitive fields for a data source

        This endpoint returns sensitive credentials in plaintext.
        Rate limited to 10 requests per minute per user.
        All requests are logged for audit purposes.
        """
        data_source = self.get_object()

        # Audit log
        logger.warning(
            f"User {request.user.username} (ID: {request.user.id}) "
            f"requested decrypted credentials for data source '{data_source.name}' (ID: {data_source.id})"
        )

        decrypted_data = {
            "id": data_source.id,
            "name": data_source.name,
            "type": data_source.type,
        }

        # Add decrypted API credentials
        if data_source.type == "api":
            decrypted_data["base_url"] = data_source.base_url
            decrypted_data["auth_type"] = data_source.auth_type
            decrypted_data["basic_user"] = data_source.basic_user
            decrypted_data["header_name"] = data_source.header_name

            if data_source.bearer_token:
                decrypted_data["bearer_token"] = (
                    data_source.get_decrypted_bearer_token()
                )
            if data_source.basic_pass:
                decrypted_data["basic_pass"] = data_source.get_decrypted_basic_pass()
            if data_source.header_value:
                decrypted_data["header_value"] = (
                    data_source.get_decrypted_header_value()
                )

        # Add decrypted database credentials
        elif data_source.type == "database":
            decrypted_data["database_type"] = data_source.database_type
            decrypted_data["host"] = data_source.host
            decrypted_data["port"] = data_source.port
            decrypted_data["database_name"] = data_source.database_name
            decrypted_data["username"] = data_source.username

            if data_source.password:
                decrypted_data["password"] = data_source.get_decrypted_password()

        # Add decrypted S3 credentials
        elif data_source.type == "s3":
            decrypted_data["s3_endpoint"] = data_source.s3_endpoint
            decrypted_data["s3_region"] = data_source.s3_region
            decrypted_data["s3_bucket"] = data_source.s3_bucket
            decrypted_data["s3_access_key"] = data_source.s3_access_key

            if data_source.s3_secret_key:
                decrypted_data["s3_secret_key"] = (
                    data_source.get_decrypted_s3_secret_key()
                )

        # Add decrypted SFTP credentials
        elif data_source.type == "sftp":
            decrypted_data["sftp_host"] = data_source.sftp_host
            decrypted_data["sftp_port"] = data_source.sftp_port
            decrypted_data["sftp_username"] = data_source.sftp_username

            if data_source.sftp_password:
                decrypted_data["sftp_password"] = (
                    data_source.get_decrypted_sftp_password()
                )
            if data_source.sftp_key:
                decrypted_data["sftp_key"] = data_source.get_decrypted_sftp_key()

        return Response(decrypted_data)


class StreamViewSet(viewsets.ModelViewSet):
    serializer_class = StreamSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Stream.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["post"])
    def execute(self, request, pk=None):
        """
        Execute a stream immediately (discover files and create data packages).
        """
        import subprocess

        stream = self.get_object()

        # Only S3 supported for now
        if not stream.data_source or stream.data_source.type != "s3":
            return Response(
                {"error": "Only S3 streams are supported for execution"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not stream.topic:
            return Response(
                {"error": "Stream must have a topic assigned"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Execute the management command
            result = subprocess.run(
                ["python", "manage.py", "execute_stream", str(stream.id)],
                capture_output=True,
                text=True,
                check=True,
            )

            # Parse output for results
            output_lines = result.stdout.split("\n")
            created_count = 0
            for line in output_lines:
                if "Created" in line and "data package" in line:
                    # Extract number from "Created X data package(s)"
                    import re

                    match = re.search(r"Created (\d+)", line)
                    if match:
                        created_count = int(match.group(1))

            return Response(
                {
                    "status": "success",
                    "message": f"Stream executed successfully",
                    "packages_created": created_count,
                    "output": result.stdout,
                }
            )

        except subprocess.CalledProcessError as e:
            logger.error(f"Error executing stream {stream.id}: {e.stderr}")
            return Response(
                {"error": "Stream execution failed", "details": e.stderr},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        except Exception as e:
            logger.error(f"Unexpected error executing stream: {e}")
            return Response(
                {"error": "Internal server error"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=["post"])
    def preview_s3_files(self, request):
        """
        Preview S3 files matching a pattern.
        Expects: data_source_id, path_pattern
        Returns: list of matching files
        """
        from .s3_utils import S3FileDiscovery
        from .models import DataSource

        data_source_id = request.data.get("data_source_id")
        path_pattern = request.data.get("path_pattern")

        if not data_source_id or not path_pattern:
            return Response(
                {"error": "data_source_id and path_pattern are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Get data source
            data_source = DataSource.objects.get(
                id=data_source_id, user=request.user, type="s3"
            )

            # Initialize S3 client with decrypted credentials
            s3_discovery = S3FileDiscovery(
                endpoint_url=data_source.s3_endpoint,
                region=data_source.s3_region or "us-east-1",
                access_key=data_source.s3_access_key,
                secret_key=data_source.get_decrypted_s3_secret_key(),
            )

            # List files matching pattern
            files = s3_discovery.list_files(
                bucket=data_source.s3_bucket,
                path_pattern=path_pattern,
                max_files=50,  # Limit preview to 50 files
            )

            return Response(
                {
                    "files": files,
                    "count": len(files),
                    "bucket": data_source.s3_bucket,
                    "pattern": path_pattern,
                }
            )

        except DataSource.DoesNotExist:
            return Response(
                {"error": "Data source not found or not an S3 source"},
                status=status.HTTP_404_NOT_FOUND,
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Error previewing S3 files: {e}")
            return Response(
                {"error": "Internal server error"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class TopicViewSet(viewsets.ModelViewSet):
    serializer_class = TopicSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Topic.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class TopicRevisionViewSet(viewsets.ModelViewSet):
    serializer_class = TopicRevisionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return TopicRevision.objects.filter(topic__user=self.request.user)


class DataPackageViewSet(viewsets.ModelViewSet):
    serializer_class = DataPackageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = DataPackage.objects.filter(user=self.request.user)
        
        # Filter by topic_revision if provided
        topic_revision = self.request.query_params.get('topic_revision', None)
        if topic_revision:
            queryset = queryset.filter(topic_revision=topic_revision)
        
        return queryset

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class ModelViewSet(viewsets.ModelViewSet):
    serializer_class = ModelSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Model.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class RunViewSet(viewsets.ModelViewSet):
    serializer_class = RunSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Run.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
