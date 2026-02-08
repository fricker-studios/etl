from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


@api_view(['GET'])
@permission_classes([AllowAny])
def demo_mode_check(request):
    """Check if demo mode is enabled"""
    return Response({'demo_mode': settings.DEMO_MODE})


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """Login endpoint that returns JWT tokens"""
    username = request.data.get('username')
    password = request.data.get('password')
    
    # Demo mode: allow login without credentials
    if settings.DEMO_MODE:
        # Security: Only allow demo mode in DEBUG mode
        if not settings.DEBUG:
            logger.error("DEMO_MODE is enabled but DEBUG is False - this is a security risk!")
            return Response(
                {'error': 'Configuration error'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        logger.warning("Demo mode is active - authentication bypassed")
        
        # Get or create demo user
        user, created = User.objects.get_or_create(
            username='demo',
            defaults={
                'email': 'demo@example.com',
                'is_staff': False,
                'is_superuser': False
            }
        )
        if created:
            user.set_password('demo')
            user.save()
        
        refresh = RefreshToken.for_user(user)
        return Response({
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
            },
            'demo_mode': True
        })
    
    if not username or not password:
        return Response(
            {'error': 'Please provide both username and password'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    user = authenticate(username=username, password=password)
    
    if user is not None:
        refresh = RefreshToken.for_user(user)
        return Response({
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
            }
        })
    
    return Response(
        {'error': 'Invalid credentials'},
        status=status.HTTP_401_UNAUTHORIZED
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """Logout endpoint"""
    return Response({'message': 'Logged out successfully'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me_view(request):
    """Get current user information"""
    return Response({
        'id': request.user.id,
        'username': request.user.username,
        'email': request.user.email,
    })
