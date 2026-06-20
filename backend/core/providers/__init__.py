"""Provider factory (Task 0.2 / updated Task 5.0).

get_provider() reads settings.PROVIDER and returns the appropriate provider instance.

  "mock"         → MockProvider()
  "api_football" → ApiFootballProvider()
  <anything else> → ValueError
"""
from django.conf import settings


def get_provider():
    """Return a provider instance based on settings.PROVIDER."""
    provider_name = settings.PROVIDER

    if provider_name == "mock":
        from core.providers.mock import MockProvider
        return MockProvider()

    if provider_name == "api_football":
        from core.providers.api_football import ApiFootballProvider
        return ApiFootballProvider()

    raise ValueError(
        f"Unknown PROVIDER setting: {provider_name!r}. "
        "Valid values: 'mock', 'api_football'."
    )
