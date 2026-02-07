from django.urls import path
from .views import login_view, logout_view, me_view, demo_mode_check

urlpatterns = [
    path('login/', login_view, name='login'),
    path('logout/', logout_view, name='logout'),
    path('me/', me_view, name='me'),
    path('demo-mode/', demo_mode_check, name='demo-mode'),
]
