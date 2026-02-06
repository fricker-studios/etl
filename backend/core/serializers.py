from rest_framework import serializers
from .models import StorageBackend, ApiSource, Stream, DataPackage, Model


class StorageBackendSerializer(serializers.ModelSerializer):
    class Meta:
        model = StorageBackend
        fields = '__all__'
        read_only_fields = ('user', 'created_at', 'updated_at')


class ApiSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApiSource
        fields = '__all__'
        read_only_fields = ('user', 'created_at', 'updated_at')


class StreamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Stream
        fields = '__all__'
        read_only_fields = ('user', 'created_at', 'updated_at')


class DataPackageSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataPackage
        fields = '__all__'
        read_only_fields = ('user', 'created_at', 'updated_at')


class ModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Model
        fields = '__all__'
        read_only_fields = ('user', 'created_at', 'updated_at')
