"""Smoke tests for Django settings and project skeleton."""
import pytest
from django.conf import settings


@pytest.mark.django_db
def test_settings_import():
    """Django settings can be imported without error."""
    assert settings.configured


def test_provider_default():
    """PROVIDER defaults to 'mock' when env var is not set."""
    assert settings.PROVIDER == "mock"


def test_installed_apps():
    """Required apps are in INSTALLED_APPS."""
    assert "core" in settings.INSTALLED_APPS
    assert "rest_framework" in settings.INSTALLED_APPS
    assert "corsheaders" in settings.INSTALLED_APPS


def test_cors_origin():
    """Vite dev origin is in CORS_ALLOWED_ORIGINS."""
    assert "http://localhost:5173" in settings.CORS_ALLOWED_ORIGINS


def test_redis_url_default():
    """REDIS_URL has a sensible default."""
    assert settings.REDIS_URL == "redis://localhost:6379/0"
