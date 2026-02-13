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
        logger.info(f"Creating storage backend with data: {serializer.validated_data}")
        instance = serializer.save(user=self.request.user)
        logger.info(
            f"Created storage backend: {instance.name} (ID: {instance.id}), "
            f"access_key_id: {'SET' if instance.access_key_id else 'NULL'}, "
            f"secret_access_key: {'SET' if instance.secret_access_key else 'NULL'}"
        )

    @action(detail=True, methods=["get"], throttle_classes=[DecryptRateThrottle])
    def decrypt(self, request, pk=None):
        """Get decrypted sensitive fields for a storage backend

        This endpoint returns sensitive credentials in plaintext.
        Rate limited to 10 requests per minute per user.
        All requests are logged for audit purposes.
        """
        storage_backend = self.get_object()

        # Audit log
        logger.warning(
            f"User {request.user.username} (ID: {request.user.id}) "
            f"requested decrypted credentials for storage backend '{storage_backend.name}' (ID: {storage_backend.id})"
        )

        decrypted_data = {
            "id": storage_backend.id,
            "name": storage_backend.name,
            "kind": storage_backend.kind,
        }

        # Add decrypted S3 credentials
        if storage_backend.kind == "s3":
            decrypted_data["endpoint"] = storage_backend.endpoint
            decrypted_data["region"] = storage_backend.region
            decrypted_data["bucket"] = storage_backend.bucket
            decrypted_data["access_key_id"] = storage_backend.access_key_id
            decrypted_data["path_style"] = storage_backend.path_style
            decrypted_data["tls_verify"] = storage_backend.tls_verify

            if storage_backend.secret_access_key:
                decrypted_data["secret_access_key"] = (
                    storage_backend.get_decrypted_secret_access_key()
                )

        # Add decrypted ClickHouse credentials
        elif storage_backend.kind == "clickhouse":
            decrypted_data["mode"] = storage_backend.mode
            decrypted_data["hosts"] = storage_backend.hosts
            decrypted_data["database"] = storage_backend.database
            decrypted_data["username"] = storage_backend.username
            decrypted_data["secure"] = storage_backend.secure

            if storage_backend.password:
                decrypted_data["password"] = storage_backend.get_decrypted_password()

        return Response(decrypted_data)

    @action(detail=True, methods=["get"])
    def browse_s3(self, request, pk=None):
        """Browse S3 files in a storage backend

        Query parameters:
        - prefix: Path prefix to list (default: "")
        - delimiter: Delimiter for folder-like structure (default: "/")
        """
        storage_backend = self.get_object()

        if storage_backend.kind != "s3":
            return Response(
                {"error": "This storage backend is not an S3 bucket"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        prefix = request.query_params.get("prefix", "")
        delimiter = request.query_params.get("delimiter", "/")

        # Debug logging
        logger.info(
            f"S3 Browse Request - Backend: {storage_backend.name} (ID: {storage_backend.id})"
        )
        logger.info(
            f"S3 Config - Endpoint: {storage_backend.endpoint}, Region: {storage_backend.region or 'us-east-1'}, Bucket: {storage_backend.bucket}"
        )
        logger.info(
            f"S3 Config - Path-style: {storage_backend.path_style}, TLS verify: {storage_backend.tls_verify}"
        )
        logger.info(
            f"S3 Config - Access Key ID: {storage_backend.access_key_id[:10]}... (truncated)"
        )
        logger.info(f"S3 Browse - Prefix: '{prefix}', Delimiter: '{delimiter}'")

        try:
            from botocore.config import Config

            # Create config for path-style addressing and signature version
            # Ceph RGW typically needs signature_version='s3v4' and path-style addressing
            config_params = {
                "s3": {
                    "addressing_style": "path" if storage_backend.path_style else "auto"
                },
                "signature_version": "s3v4",  # Force v4 signatures for Ceph compatibility
            }
            config = Config(**config_params)

            logger.info(f"S3 Client Config: {config_params}")

            # Create S3 client directly with path_style support
            import boto3

            # Use exact region from database - no mapping needed
            region = storage_backend.region if storage_backend.region else None
            logger.info(f"Using region: '{region}'")

            # Clean endpoint URL - remove trailing slashes which can cause signature issues
            endpoint_url = (
                storage_backend.endpoint.rstrip("/")
                if storage_backend.endpoint
                else None
            )

            # Get decrypted secret key
            secret_key = storage_backend.get_decrypted_secret_access_key()
            if not secret_key:
                logger.error(
                    f"Failed to decrypt secret access key for storage backend {storage_backend.id}"
                )
                return Response(
                    {"error": "Failed to decrypt S3 credentials"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            s3_client = boto3.client(
                "s3",
                endpoint_url=endpoint_url,
                region_name=region,
                aws_access_key_id=storage_backend.access_key_id,
                aws_secret_access_key=secret_key,
                config=config,
                verify=storage_backend.tls_verify,  # Honor TLS verification setting
            )

            logger.info(f"S3 Client created, attempting list_objects_v2...")

            response = s3_client.list_objects_v2(
                Bucket=storage_backend.bucket,
                Prefix=prefix,
                Delimiter=delimiter,
                MaxKeys=1000,
            )

            logger.info(
                f"S3 list_objects_v2 successful - Found {len(response.get('Contents', []))} objects, {len(response.get('CommonPrefixes', []))} folders"
            )

            # Extract folders (common prefixes) and files
            folders = []
            if "CommonPrefixes" in response:
                folders = [
                    {
                        "name": prefix["Prefix"].rstrip("/").split("/")[-1],
                        "prefix": prefix["Prefix"],
                        "type": "folder",
                    }
                    for prefix in response["CommonPrefixes"]
                ]

            files = []
            if "Contents" in response:
                files = [
                    {
                        "name": obj["Key"].split("/")[-1],
                        "key": obj["Key"],
                        "size": obj["Size"],
                        "last_modified": obj["LastModified"].isoformat(),
                        "type": "file",
                    }
                    for obj in response["Contents"]
                    if obj["Key"] != prefix  # Exclude the prefix itself
                ]

            return Response(
                {
                    "bucket": storage_backend.bucket,
                    "prefix": prefix,
                    "folders": folders,
                    "files": files,
                    "is_truncated": response.get("IsTruncated", False),
                }
            )

        except Exception as e:
            logger.error(
                f"Error browsing S3 for backend {storage_backend.name}: {type(e).__name__}: {str(e)}"
            )
            logger.error(
                f"S3 Error Details - Endpoint: {storage_backend.endpoint}, Bucket: {storage_backend.bucket}, Path-style: {storage_backend.path_style}"
            )
            import traceback

            logger.error(f"Full traceback: {traceback.format_exc()}")
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=["delete"])
    def delete_s3_file(self, request, pk=None):
        """Delete a file from S3

        Query parameters:
        - key: S3 object key (file path) to delete
        """
        storage_backend = self.get_object()

        if storage_backend.kind != "s3":
            return Response(
                {"error": "This storage backend is not an S3 bucket"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file_key = request.query_params.get("key")
        if not file_key:
            return Response(
                {"error": "File key is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        logger.info(
            f"S3 Delete Request - Backend: {storage_backend.name} (ID: {storage_backend.id})"
        )
        logger.info(f"File key: {file_key}")

        try:
            import boto3
            from botocore.config import Config

            # Create S3 client config
            config_params = {
                "s3": {
                    "addressing_style": "path" if storage_backend.path_style else "auto"
                },
                "signature_version": "s3v4",
            }
            config = Config(**config_params)

            # Use exact region from database
            region = storage_backend.region if storage_backend.region else None

            # Clean endpoint URL
            endpoint_url = (
                storage_backend.endpoint.rstrip("/")
                if storage_backend.endpoint
                else None
            )

            # Get decrypted secret key
            secret_key = storage_backend.get_decrypted_secret_access_key()
            if not secret_key:
                logger.error(
                    f"Failed to decrypt secret access key for storage backend {storage_backend.id}"
                )
                return Response(
                    {"error": "Failed to decrypt S3 credentials"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            # Create S3 client
            s3_client = boto3.client(
                "s3",
                endpoint_url=endpoint_url,
                region_name=region,
                aws_access_key_id=storage_backend.access_key_id,
                aws_secret_access_key=secret_key,
                config=config,
                verify=storage_backend.tls_verify,
            )

            # Delete the object
            s3_client.delete_object(Bucket=storage_backend.bucket, Key=file_key)

            logger.info(f"Successfully deleted S3 file: {file_key}")

            return Response({"message": "File deleted successfully"})

        except Exception as e:
            logger.error(
                f"Error deleting S3 file for backend {storage_backend.name}: {type(e).__name__}: {str(e)}"
            )
            import traceback

            logger.error(f"Full traceback: {traceback.format_exc()}")
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


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

    def perform_update(self, serializer):
        """Allow updating streams while maintaining user ownership."""
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["post"])
    def execute(self, request, pk=None):
        """
        Execute a stream immediately (discover files and create data packages).
        Uses Celery for asynchronous execution.
        Supports S3 and API streams.
        """
        from core.tasks import execute_stream_task
        from django.utils import timezone

        stream = self.get_object()

        # Check that stream has a data source
        if not stream.data_source:
            return Response(
                {"error": "Stream must have a data source configured"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check supported data source types
        if stream.data_source.type not in ["s3", "api"]:
            return Response(
                {
                    "error": f"Data source type '{stream.data_source.type}' is not supported for execution. Supported types: s3, api"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not stream.topic:
            return Response(
                {"error": "Stream must have a topic assigned"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Additional validation for API streams
        if stream.data_source.type == "api":
            if not stream.method or not stream.path:
                return Response(
                    {"error": "API stream must have method and path configured"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Check if S3 storage backend is configured
            from core.models import StorageBackend

            storage_backend = StorageBackend.objects.filter(
                user=request.user, kind="s3"
            ).first()

            if not storage_backend:
                return Response(
                    {
                        "error": "No S3 storage backend configured. Please configure an S3 storage backend in Settings before executing API streams."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        try:
            # Create a Run instance to track this execution
            run = Run.objects.create(
                user=request.user,
                stream=stream,
                name=f"{stream.name} - {timezone.now().strftime('%Y-%m-%d %H:%M:%S')}",
                status="queued",
            )

            # Dispatch Celery task
            task = execute_stream_task.delay(stream.id, run.id)

            return Response(
                {
                    "status": "queued",
                    "message": f"Stream execution queued",
                    "run_id": run.id,
                    "task_id": task.id,
                }
            )

        except Exception as e:
            logger.error(f"Error queueing stream execution {stream.id}: {e}")
            return Response(
                {"error": "Failed to queue stream execution"},
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
        topic_revision = self.request.query_params.get("topic_revision", None)
        if topic_revision:
            queryset = queryset.filter(topic_revision=topic_revision)

        return queryset

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_destroy(self, instance):
        """
        Delete the DataPackage and optionally delete the file from S3 if it's internal storage.
        Only delete from S3 if:
        - The package has a destination (internal S3 storage backend)
        - The package does NOT have an external_s3_source (not a reference to external data)
        """
        # Check if we should delete the S3 file
        should_delete_s3_file = (
            instance.destination  # Has internal storage backend
            and instance.destination.kind == "s3"  # Storage is S3
            and not instance.external_s3_source  # Not an external reference
            and instance.file_path  # Has a file path
        )

        if should_delete_s3_file:
            try:
                import boto3
                from botocore.config import Config

                storage = instance.destination

                logger.info(
                    f"Deleting S3 file for package {instance.name} (ID: {instance.id})"
                )
                logger.info(f"File path: {instance.file_path}")
                logger.info(f"Bucket: {storage.bucket}")

                # Create S3 client config
                config_params = {
                    "s3": {
                        "addressing_style": "path" if storage.path_style else "auto"
                    },
                    "signature_version": "s3v4",
                }
                config = Config(**config_params)

                # Use exact region from database
                region = storage.region if storage.region else None

                # Clean endpoint URL
                endpoint_url = (
                    storage.endpoint.rstrip("/") if storage.endpoint else None
                )

                # Get decrypted secret key
                secret_key = storage.get_decrypted_secret_access_key()

                if not secret_key:
                    logger.warning(
                        f"Failed to decrypt secret key for storage backend {storage.id}, skipping S3 file deletion"
                    )
                else:
                    # Create S3 client
                    s3_client = boto3.client(
                        "s3",
                        endpoint_url=endpoint_url,
                        region_name=region,
                        aws_access_key_id=storage.access_key_id,
                        aws_secret_access_key=secret_key,
                        config=config,
                        verify=storage.tls_verify,
                    )

                    # Delete the object from S3
                    s3_client.delete_object(
                        Bucket=storage.bucket, Key=instance.file_path
                    )

                    logger.info(f"Successfully deleted S3 file: {instance.file_path}")

            except Exception as e:
                # Log the error but don't prevent package deletion
                logger.error(
                    f"Error deleting S3 file for package {instance.name}: {e}",
                    exc_info=True,
                )
                logger.warning(f"Continuing with package deletion despite S3 error")

        # Delete the package from the database
        instance.delete()

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        """Generate a presigned URL for downloading a data package from S3

        This endpoint generates a temporary presigned URL that allows downloading
        the package file from S3 without exposing credentials.
        """
        package = self.get_object()

        if not package.file_path:
            return Response(
                {"error": "No file associated with this package"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not package.destination or package.destination.kind != "s3":
            return Response(
                {"error": "Package is not stored in an S3 backend"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Debug logging
        storage = package.destination
        logger.info(
            f"Package Download Request - Package: {package.name} (ID: {package.id})"
        )
        logger.info(
            f"S3 Config - Endpoint: {storage.endpoint}, Region: {storage.region or 'us-east-1'}, Bucket: {storage.bucket}"
        )
        logger.info(
            f"S3 Config - Path-style: {storage.path_style}, TLS verify: {storage.tls_verify}"
        )
        logger.info(f"S3 Config - File path: {package.file_path}")
        logger.info(
            f"S3 Config - Access Key ID: {storage.access_key_id[:10]}... (truncated)"
        )

        try:
            import boto3
            from botocore.exceptions import ClientError
            from botocore.config import Config

            # Create config for path-style addressing and signature version
            # Ceph RGW typically needs signature_version='s3v4' and path-style addressing
            config_params = {
                "s3": {"addressing_style": "path" if storage.path_style else "auto"},
                "signature_version": "s3v4",  # Force v4 signatures for Ceph compatibility
            }
            config = Config(**config_params)

            logger.info(f"S3 Client Config for download: {config_params}")

            # Use exact region from database - no mapping needed
            region = storage.region if storage.region else None
            logger.info(f"Using region: '{region}'")

            # Clean endpoint URL - remove trailing slashes which can cause signature issues
            endpoint_url = storage.endpoint.rstrip("/") if storage.endpoint else None
            logger.info(
                f"Cleaned endpoint URL: {endpoint_url} (original: {storage.endpoint})"
            )

            # Get decrypted secret key
            secret_key = storage.get_decrypted_secret_access_key()
            if not secret_key:
                logger.error(
                    f"Failed to decrypt secret access key for storage backend {storage.id}"
                )
                return Response(
                    {"error": "Failed to decrypt S3 credentials"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            logger.info(
                f"Secret key decrypted successfully (length: {len(secret_key)})"
            )

            # Create S3 client
            s3_client = boto3.client(
                "s3",
                endpoint_url=endpoint_url,
                region_name=region,
                aws_access_key_id=storage.access_key_id,
                aws_secret_access_key=secret_key,
                config=config,
                verify=storage.tls_verify,  # Honor TLS verification setting
            )

            logger.info(f"S3 Client created, generating presigned URL...")

            # Generate presigned URL (valid for 1 hour)
            # Use explicit method to ensure proper signature calculation with Ceph/Minio
            try:
                presigned_url = s3_client.generate_presigned_url(
                    ClientMethod="get_object",
                    Params={
                        "Bucket": storage.bucket,
                        "Key": package.file_path,
                    },
                    ExpiresIn=3600,
                    HttpMethod="GET",
                )
                logger.info(
                    f"Presigned URL generated successfully for package {package.name}"
                )
            except Exception as url_error:
                logger.error(f"Error generating presigned URL: {url_error}")
                raise

            return Response(
                {
                    "download_url": presigned_url,
                    "file_name": package.file_path.split("/")[-1],
                    "expires_in": 3600,
                }
            )

        except ClientError as e:
            logger.error(
                f"ClientError generating presigned URL for package {package.name}: {type(e).__name__}: {str(e)}"
            )
            logger.error(
                f"S3 Error Details - Endpoint: {storage.endpoint}, Bucket: {storage.bucket}, Path: {package.file_path}, Path-style: {storage.path_style}"
            )
            import traceback

            logger.error(f"Full traceback: {traceback.format_exc()}")
            return Response(
                {"error": f"Failed to generate download URL: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        except Exception as e:
            logger.error(
                f"Unexpected error generating download URL for package {package.name}: {type(e).__name__}: {str(e)}"
            )
            logger.error(
                f"S3 Error Details - Endpoint: {storage.endpoint}, Bucket: {storage.bucket}, Path: {package.file_path}"
            )
            import traceback

            logger.error(f"Full traceback: {traceback.format_exc()}")
            return Response(
                {"error": f"Failed to generate download URL: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class ModelViewSet(viewsets.ModelViewSet):
    serializer_class = ModelSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Model.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=["get"])
    def clickhouse_status(self, request):
        """Check if ClickHouse backend is configured for the current user"""
        try:
            clickhouse_backend = StorageBackend.objects.filter(
                user=request.user, kind="clickhouse"
            ).first()

            if not clickhouse_backend:
                return Response(
                    {"configured": False, "message": "No ClickHouse backend configured"}
                )

            return Response(
                {
                    "configured": True,
                    "backend_id": clickhouse_backend.id,
                    "backend_name": clickhouse_backend.name,
                    "database": clickhouse_backend.database,
                }
            )
        except Exception as e:
            logger.error(f"Error checking ClickHouse status: {str(e)}")
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=["get"])
    def table_stats(self, request, pk=None):
        """Get statistics for the external table associated with this model"""
        try:
            model_instance = self.get_object()

            # Check if ClickHouse backend is configured
            clickhouse_backend = StorageBackend.objects.filter(
                user=request.user, kind="clickhouse"
            ).first()

            if not clickhouse_backend:
                return Response(
                    {
                        "configured": False,
                        "message": "No ClickHouse backend configured",
                    },
                    status=status.HTTP_404,
                )

            # Import ClickHouse client
            try:
                from clickhouse_driver import Client
            except ImportError:
                return Response(
                    {"error": "ClickHouse driver not installed"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            # Determine entity type from model structure
            entity_type = "entity"
            model_data = model_instance.definition
            if isinstance(model_data, dict):
                if model_data.get("type") == "data_vault":
                    if model_data.get("hubs"):
                        entity_type = "hub"
                    elif model_data.get("links"):
                        entity_type = "link"
                    elif model_data.get("satellites"):
                        entity_type = "satellite"
                else:
                    if model_data.get("facts"):
                        entity_type = "fact"
                    elif model_data.get("dimensions"):
                        entity_type = "dimension"

            # Generate table name
            model_name = model_instance.name.lower().replace(" ", "")
            database = clickhouse_backend.database or "default"
            table_name = f"{entity_type}_{model_name}"

            # Connect to ClickHouse
            hosts = clickhouse_backend.hosts
            if not hosts or not isinstance(hosts, list) or len(hosts) == 0:
                return Response(
                    {"error": "ClickHouse hosts not configured"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            host_config = hosts[0]
            client = Client(
                host=host_config.get("host", "localhost"),
                port=host_config.get("port", 9000),
                database=database,
                user=clickhouse_backend.username or "default",
                password=clickhouse_backend.get_decrypted_password() or "",
                secure=clickhouse_backend.secure,
            )

            # Check if table exists
            table_exists_query = f"""
                SELECT count() FROM system.tables 
                WHERE database = '{database}' AND name = '{table_name}'
            """
            exists_result = client.execute(table_exists_query)
            table_exists = exists_result[0][0] > 0

            if not table_exists:
                return Response(
                    {
                        "configured": True,
                        "exists": False,
                        "table_name": f"{database}.{table_name}",
                        "status": "not_created",
                        "message": f"Table {database}.{table_name} does not exist",
                    }
                )

            # Get row count
            row_count_query = f"SELECT count() FROM {database}.{table_name}"
            row_count_result = client.execute(row_count_query)
            row_count = row_count_result[0][0]

            # Get column count
            column_count_query = f"""
                SELECT count() FROM system.columns 
                WHERE database = '{database}' AND table = '{table_name}'
            """
            column_count_result = client.execute(column_count_query)
            column_count = column_count_result[0][0]

            # Get table size (in bytes)
            size_query = f"""
                SELECT sum(bytes) FROM system.parts 
                WHERE database = '{database}' AND table = '{table_name}' AND active
            """
            size_result = client.execute(size_query)
            size_bytes = size_result[0][0] if size_result[0][0] else 0
            size_mb = size_bytes / (1024 * 1024)

            # Get last update time (modification time of any part)
            last_update_query = f"""
                SELECT max(modification_time) FROM system.parts 
                WHERE database = '{database}' AND table = '{table_name}' AND active
            """
            last_update_result = client.execute(last_update_query)
            last_updated = (
                last_update_result[0][0] if last_update_result[0][0] else None
            )

            # Get table creation time
            create_time_query = f"""
                SELECT metadata_modification_time FROM system.tables 
                WHERE database = '{database}' AND name = '{table_name}'
            """
            create_time_result = client.execute(create_time_query)
            created_at = create_time_result[0][0] if create_time_result[0][0] else None

            return Response(
                {
                    "configured": True,
                    "exists": True,
                    "table_name": f"{database}.{table_name}",
                    "status": "created",
                    "row_count": row_count,
                    "column_count": column_count,
                    "size_mb": round(size_mb, 2),
                    "last_updated": last_updated.isoformat() if last_updated else None,
                    "created_at": created_at.isoformat() if created_at else None,
                }
            )

        except Exception as e:
            logger.error(f"Error fetching table stats: {str(e)}")
            return Response(
                {
                    "error": str(e),
                    "configured": True,
                    "exists": False,
                    "status": "error",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class RunViewSet(viewsets.ModelViewSet):
    serializer_class = RunSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Run.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
