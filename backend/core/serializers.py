from rest_framework import serializers
from .models import StorageBackend, DataSource, Stream, DataPackage, Model, Run, Topic, TopicRevision


class StorageBackendSerializer(serializers.ModelSerializer):
    class Meta:
        model = StorageBackend
        fields = '__all__'
        read_only_fields = ('user', 'created_at', 'updated_at')


class DataSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataSource
        fields = '__all__'
        read_only_fields = ('user', 'created_at', 'updated_at')


class StreamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Stream
        fields = '__all__'
        read_only_fields = ('user', 'created_at', 'updated_at')


class DataPackageSerializer(serializers.ModelSerializer):
    topic_name = serializers.CharField(source='topic_revision.topic.name', read_only=True)
    revision_number = serializers.IntegerField(source='topic_revision.revision_number', read_only=True)
    
    class Meta:
        model = DataPackage
        fields = '__all__'
        read_only_fields = ('user', 'created_at', 'updated_at')


class TopicRevisionSerializer(serializers.ModelSerializer):
    package_count = serializers.SerializerMethodField()
    
    class Meta:
        model = TopicRevision
        fields = '__all__'
        read_only_fields = ('created_at',)
    
    def get_package_count(self, obj):
        return obj.packages.count()


class TopicSerializer(serializers.ModelSerializer):
    revisions = TopicRevisionSerializer(many=True, read_only=True)
    current_revision = TopicRevisionSerializer(read_only=True)
    total_packages = serializers.SerializerMethodField()
    
    class Meta:
        model = Topic
        fields = '__all__'
        read_only_fields = ('user', 'created_at', 'updated_at')
    
    def get_total_packages(self, obj):
        return DataPackage.objects.filter(topic_revision__topic=obj).count()


class ModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Model
        fields = '__all__'
        read_only_fields = ('user', 'created_at', 'updated_at')


class RunSerializer(serializers.ModelSerializer):
    class Meta:
        model = Run
        fields = '__all__'
        read_only_fields = ('user', 'created_at', 'updated_at')
