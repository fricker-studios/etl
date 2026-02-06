from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    StorageBackendViewSet,
    DataSourceViewSet,
    StreamViewSet,
    DataPackageViewSet,
    ModelViewSet,
    RunViewSet,
    TopicViewSet,
    TopicRevisionViewSet,
)

router = DefaultRouter()
router.register(r'storage-backends', StorageBackendViewSet, basename='storagebackend')
router.register(r'data-sources', DataSourceViewSet, basename='datasource')
router.register(r'streams', StreamViewSet, basename='stream')
router.register(r'topics', TopicViewSet, basename='topic')
router.register(r'topic-revisions', TopicRevisionViewSet, basename='topicrevision')
router.register(r'packages', DataPackageViewSet, basename='datapackage')
router.register(r'models', ModelViewSet, basename='model')
router.register(r'runs', RunViewSet, basename='run')

urlpatterns = [
    path('', include(router.urls)),
]
