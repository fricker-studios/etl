"""
Encryption utilities for sensitive fields like passwords and API tokens.
Uses Fernet symmetric encryption with a key derived from Django's SECRET_KEY.
"""

from cryptography.fernet import Fernet
from django.conf import settings
import base64
import hashlib


def get_encryption_key():
    """Generate a Fernet key from Django's SECRET_KEY."""
    # Use SHA256 to derive a 32-byte key from SECRET_KEY
    key = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return base64.urlsafe_b64encode(key)


def encrypt_value(value: str) -> str:
    """Encrypt a string value."""
    if not value:
        return value

    fernet = Fernet(get_encryption_key())
    encrypted = fernet.encrypt(value.encode())
    return encrypted.decode()


def decrypt_value(encrypted_value: str) -> str:
    """Decrypt an encrypted string value."""
    if not encrypted_value:
        return encrypted_value

    try:
        fernet = Fernet(get_encryption_key())
        decrypted = fernet.decrypt(encrypted_value.encode())
        return decrypted.decode()
    except Exception:
        # If decryption fails, return the original value (might be unencrypted legacy data)
        return encrypted_value
