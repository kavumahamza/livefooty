"""TDD tests for the provider factory (Task 0.2 / updated Task 5.0)."""
import pytest
from django.test import override_settings

from core.providers import get_provider
from core.providers.mock import MockProvider


@override_settings(PROVIDER="mock")
def test_get_provider_mock_returns_mock_provider_instance():
    provider = get_provider()
    assert isinstance(provider, MockProvider)


@override_settings(PROVIDER="unknown_provider")
def test_get_provider_unknown_raises_value_error():
    with pytest.raises(ValueError, match="unknown_provider"):
        get_provider()


@override_settings(PROVIDER="api_football", API_FOOTBALL_KEY="test-key")
def test_get_provider_api_football_returns_api_football_provider():
    """Task 5.0: api_football provider is now implemented (no longer NotImplementedError)."""
    from core.providers.api_football import ApiFootballProvider

    provider = get_provider()
    assert isinstance(provider, ApiFootballProvider)
