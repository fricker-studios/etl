from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import StorageBackend, DataSource, Stream, DataPackage, Model
from .serializers import (
    StorageBackendSerializer,
    DataSourceSerializer,
    StreamSerializer,
    DataPackageSerializer,
    ModelSerializer,
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


class StreamViewSet(viewsets.ModelViewSet):
    serializer_class = StreamSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Stream.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


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
