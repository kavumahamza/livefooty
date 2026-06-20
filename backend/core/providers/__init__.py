"""Provider factory (Task 0.2).

get_provider() reads settings.PROVIDER and returns the appropriate provider instance.

  "mock"         → MockProvider()
  "api_football" → NotImplementedError (Task 1.x)
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
        raise NotImplementedError(
            "api_football provider not implemented until Task 1.x"
        )

    raise ValueError(
        f"Unknown PROVIDER setting: {provider_name!r}. "
        "Valid values: 'mock', 'api_football'."
    )
