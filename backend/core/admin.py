from django.contrib import admin
from .models import StorageBackend, DataSource, Stream, DataPackage, Model, Run


@admin.register(StorageBackend)
class StorageBackendAdmin(admin.ModelAdmin):
    list_display = ('name', 'kind', 'user', 'created_at')
    list_filter = ('kind', 'created_at')
    search_fields = ('name', 'user__username')


@admin.register(DataSource)
class DataSourceAdmin(admin.ModelAdmin):
    list_display = ('name', 'type', 'user', 'created_at')
    list_filter = ('type', 'created_at')
    search_fields = ('name', 'user__username')


@admin.register(Stream)
class StreamAdmin(admin.ModelAdmin):
    list_display = ('name', 'data_source', 'user', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('name', 'user__username')


@admin.register(DataPackage)
class DataPackageAdmin(admin.ModelAdmin):
    list_display = ('name', 'stream', 'status', 'user', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('name', 'user__username')


@admin.register(Model)
class ModelAdmin(admin.ModelAdmin):
    list_display = ('name', 'type', 'user', 'created_at')
    list_filter = ('type', 'created_at')
    search_fields = ('name', 'user__username')


@admin.register(Run)
class RunAdmin(admin.ModelAdmin):
    list_display = ('name', 'status', 'stream', 'started_at', 'duration_seconds', 'user', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('name', 'user__username')
