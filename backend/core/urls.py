from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    StorageBackendViewSet,
    ApiSourceViewSet,
    StreamViewSet,
    DataPackageViewSet,
    ModelViewSet,
)

router = DefaultRouter()
router.register(r'storage-backends', StorageBackendViewSet, basename='storagebackend')
router.register(r'api-sources', ApiSourceViewSet, basename='apisource')
router.register(r'streams', StreamViewSet, basename='stream')
router.register(r'packages', DataPackageViewSet, basename='datapackage')
router.register(r'models', ModelViewSet, basename='model')

urlpatterns = [
    path('', include(router.urls)),
]
