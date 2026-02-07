from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import StorageBackend, DataSource, Stream, DataPackage, Model, Run, Topic, TopicRevision
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
    
    @action(detail=True, methods=['get'])
    def decrypt(self, request, pk=None):
        """Get decrypted sensitive fields for a data source"""
        data_source = self.get_object()
        
        decrypted_data = {
            'id': data_source.id,
            'name': data_source.name,
            'type': data_source.type,
        }
        
        # Add decrypted API credentials
        if data_source.type == 'api':
            decrypted_data['base_url'] = data_source.base_url
            decrypted_data['auth_type'] = data_source.auth_type
            decrypted_data['basic_user'] = data_source.basic_user
            decrypted_data['header_name'] = data_source.header_name
            
            if data_source.bearer_token:
                decrypted_data['bearer_token'] = data_source.get_decrypted_bearer_token()
            if data_source.basic_pass:
                decrypted_data['basic_pass'] = data_source.get_decrypted_basic_pass()
            if data_source.header_value:
                decrypted_data['header_value'] = data_source.get_decrypted_header_value()
        
        # Add decrypted database credentials
        elif data_source.type == 'database':
            decrypted_data['database_type'] = data_source.database_type
            decrypted_data['host'] = data_source.host
            decrypted_data['port'] = data_source.port
            decrypted_data['database_name'] = data_source.database_name
            decrypted_data['username'] = data_source.username
            
            if data_source.password:
                decrypted_data['password'] = data_source.get_decrypted_password()
        
        # Add decrypted S3 credentials
        elif data_source.type == 's3':
            decrypted_data['s3_endpoint'] = data_source.s3_endpoint
            decrypted_data['s3_region'] = data_source.s3_region
            decrypted_data['s3_bucket'] = data_source.s3_bucket
            decrypted_data['s3_access_key'] = data_source.s3_access_key
            
            if data_source.s3_secret_key:
                decrypted_data['s3_secret_key'] = data_source.get_decrypted_s3_secret_key()
        
        # Add decrypted SFTP credentials
        elif data_source.type == 'sftp':
            decrypted_data['sftp_host'] = data_source.sftp_host
            decrypted_data['sftp_port'] = data_source.sftp_port
            decrypted_data['sftp_username'] = data_source.sftp_username
            
            if data_source.sftp_password:
                decrypted_data['sftp_password'] = data_source.get_decrypted_sftp_password()
            if data_source.sftp_key:
                decrypted_data['sftp_key'] = data_source.get_decrypted_sftp_key()
        
        return Response(decrypted_data)


class StreamViewSet(viewsets.ModelViewSet):
    serializer_class = StreamSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Stream.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


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
        return DataPackage.objects.filter(user=self.request.user)

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
