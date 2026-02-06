from django.contrib import admin
from .models import StorageBackend, ApiSource, Stream, DataPackage, Model


@admin.register(StorageBackend)
class StorageBackendAdmin(admin.ModelAdmin):
    list_display = ('name', 'kind', 'user', 'created_at')
    list_filter = ('kind', 'created_at')
    search_fields = ('name', 'user__username')


@admin.register(ApiSource)
class ApiSourceAdmin(admin.ModelAdmin):
    list_display = ('name', 'base_url', 'auth_type', 'user', 'created_at')
    list_filter = ('auth_type', 'created_at')
    search_fields = ('name', 'base_url', 'user__username')


@admin.register(Stream)
class StreamAdmin(admin.ModelAdmin):
    list_display = ('name', 'api_source', 'method', 'user', 'created_at')
    list_filter = ('method', 'created_at')
    search_fields = ('name', 'path', 'user__username')


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
