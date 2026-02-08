from django.contrib import admin
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


@admin.register(StorageBackend)
class StorageBackendAdmin(admin.ModelAdmin):
    list_display = ("name", "kind", "user", "created_at")
    list_filter = ("kind", "created_at")
    search_fields = ("name", "user__username")


@admin.register(DataSource)
class DataSourceAdmin(admin.ModelAdmin):
    list_display = ("name", "type", "user", "created_at")
    list_filter = ("type", "created_at")
    search_fields = ("name", "user__username")


@admin.register(Stream)
class StreamAdmin(admin.ModelAdmin):
    list_display = ("name", "data_source", "user", "created_at")
    list_filter = ("created_at",)
    search_fields = ("name", "user__username")


@admin.register(Topic)
class TopicAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "created_at")
    list_filter = ("created_at",)
    search_fields = ("name", "user__username", "description")


class DataPackageInline(admin.TabularInline):
    model = DataPackage
    extra = 0
    fields = ("name", "status", "stream", "row_count_estimate")
    readonly_fields = ("name", "status", "stream", "row_count_estimate")


@admin.register(TopicRevision)
class TopicRevisionAdmin(admin.ModelAdmin):
    list_display = ("topic", "revision_number", "created_at")
    list_filter = ("topic", "created_at")
    search_fields = ("topic__name", "change_description")
    inlines = [DataPackageInline]


@admin.register(DataPackage)
class DataPackageAdmin(admin.ModelAdmin):
    list_display = ("name", "topic_revision", "stream", "status", "user", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("name", "user__username", "topic_revision__topic__name")


@admin.register(Model)
class ModelAdmin(admin.ModelAdmin):
    list_display = ("name", "type", "user", "created_at")
    list_filter = ("type", "created_at")
    search_fields = ("name", "user__username")


@admin.register(Run)
class RunAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "status",
        "stream",
        "started_at",
        "duration_seconds",
        "user",
        "created_at",
    )
    list_filter = ("status", "created_at")
    search_fields = ("name", "user__username")
