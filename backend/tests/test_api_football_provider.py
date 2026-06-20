"""TDD tests for ApiFootballProvider (Task 5.0).

HTTP is mocked via an injected session — no real network calls.
"""
from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, call, patch

import pytest
import requests
from django.test import override_settings

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_FIXTURES_DIR = Path(__file__).parent.parent / "core" / "providers" / "fixtures"


def _load_envelope(filename: str) -> dict:
    with open(_FIXTURES_DIR / filename, encoding="utf-8") as f:
        return json.load(f)


def _fake_response(envelope: dict, status_code: int = 200) -> MagicMock:
    """Build a mock requests.Response that returns *envelope* from .json()."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = envelope
    resp.raise_for_status.return_value = None  # no-op for 2xx
    return resp


def _fake_session(envelope: dict, status_code: int = 200) -> MagicMock:
    """Build a mock requests.Session whose .get() returns one fake response."""
    session = MagicMock()
    session.get.return_value = _fake_response(envelope, status_code)
    return session


# ---------------------------------------------------------------------------
# Fixtures  (pytest)
# ---------------------------------------------------------------------------

@pytest.fixture()
def api_provider():
    """ApiFootballProvider with dummy key, no real session."""
    from core.providers.api_football import ApiFootballProvider
    return ApiFootballProvider(
        api_key="test-key",
        base_url="https://test.api-sports.io",
        session=MagicMock(),  # prevent accidental real-network calls
        sleep_fn=lambda _: None,  # no real sleeping in tests
    )


# ---------------------------------------------------------------------------
# get_live_scores
# ---------------------------------------------------------------------------

@override_settings(PROVIDER="api_football", API_FOOTBALL_KEY="test-key")
def test_get_live_scores_returns_fixture_dtos(api_provider):
    """get_live_scores parses live_scores.json envelope into FixtureDTOs."""
    from core.providers.base import FixtureDTO

    envelope = _load_envelope("live_scores.json")
    api_provider._session = _fake_session(envelope)

    result = api_provider.get_live_scores()

    assert isinstance(result, list)
    assert len(result) > 0
    first = result[0]
    assert isinstance(first, FixtureDTO)
    # Known values from live_scores.json
    assert first.home == "Manchester United"
    assert first.away == "Newcastle"
    assert first.status == "1H"
    assert first.home_score == 1
    assert first.away_score == 0


# ---------------------------------------------------------------------------
# get_stats
# ---------------------------------------------------------------------------

@override_settings(PROVIDER="api_football", API_FOOTBALL_KEY="test-key")
def test_get_stats_rich_returns_stats_dto_with_attacks(api_provider):
    """get_stats(1035037) from rich stats file → attacks_home non-None."""
    from core.providers.base import StatsDTO

    envelope = _load_envelope("stats_1035037.json")
    api_provider._session = _fake_session(envelope)

    result = api_provider.get_stats(1035037)

    assert isinstance(result, StatsDTO)
    assert result.attacks_home is not None
    assert result.attacks_home == 78


@override_settings(PROVIDER="api_football", API_FOOTBALL_KEY="test-key")
def test_get_stats_sparse_returns_stats_dto_with_attacks_none(api_provider):
    """get_stats for sparse stats (no Attacks key) → attacks_home is None, no crash."""
    from core.providers.base import StatsDTO

    envelope = _load_envelope("stats_sparse_2045102.json")
    api_provider._session = _fake_session(envelope)

    result = api_provider.get_stats(2045102)

    assert isinstance(result, StatsDTO)
    assert result.attacks_home is None


@override_settings(PROVIDER="api_football", API_FOOTBALL_KEY="test-key")
def test_get_stats_empty_response_returns_none(api_provider):
    """get_stats with empty response array → None."""
    envelope = {"response": [], "errors": []}
    api_provider._session = _fake_session(envelope)

    result = api_provider.get_stats(9999)

    assert result is None


# ---------------------------------------------------------------------------
# get_events
# ---------------------------------------------------------------------------

@override_settings(PROVIDER="api_football", API_FOOTBALL_KEY="test-key")
def test_get_events_returns_event_dtos_with_goals_and_substs(api_provider):
    """get_events(1035037) → EventDTOs with goal and subst types present."""
    from core.providers.base import EventDTO

    envelope = _load_envelope("events_1035037.json")
    api_provider._session = _fake_session(envelope)

    result = api_provider.get_events(1035037)

    assert isinstance(result, list)
    assert len(result) > 0
    assert all(isinstance(e, EventDTO) for e in result)

    types = {e.type for e in result}
    assert "goal" in types

    # subst should be mapped (events_1035037.json contains a subst)
    assert "subst" in types

    # first goal is at minute 12
    goals = [e for e in result if e.type == "goal"]
    assert goals[0].minute == 12


# ---------------------------------------------------------------------------
# errors field in response
# ---------------------------------------------------------------------------

@override_settings(PROVIDER="api_football", API_FOOTBALL_KEY="test-key")
def test_errors_field_non_empty_returns_empty_list(api_provider):
    """When API returns non-empty errors field, _get returns [] — no crash."""
    envelope = {
        "errors": {"plan": "Subscriptions are required to access this endpoint."},
        "response": [],
    }
    api_provider._session = _fake_session(envelope)

    result = api_provider.get_live_scores()

    assert result == []


@override_settings(PROVIDER="api_football", API_FOOTBALL_KEY="test-key")
def test_errors_field_as_list_non_empty_returns_empty_list(api_provider):
    """errors can be a list; non-empty list also triggers empty return."""
    envelope = {"errors": ["some error"], "response": []}
    api_provider._session = _fake_session(envelope)

    result = api_provider.get_live_scores()

    assert result == []


# ---------------------------------------------------------------------------
# Retry logic
# ---------------------------------------------------------------------------

@override_settings(PROVIDER="api_football", API_FOOTBALL_KEY="test-key")
def test_get_retries_on_request_exception_and_succeeds(api_provider):
    """Session that raises RequestException twice then succeeds → data returned, called 3x."""
    from core.providers.base import FixtureDTO

    envelope = _load_envelope("live_scores.json")
    good_response = _fake_response(envelope)

    session = MagicMock()
    session.get.side_effect = [
        requests.exceptions.RequestException("timeout"),
        requests.exceptions.RequestException("timeout"),
        good_response,
    ]
    api_provider._session = session

    result = api_provider.get_live_scores()

    assert session.get.call_count == 3
    assert len(result) > 0
    assert isinstance(result[0], FixtureDTO)


@override_settings(PROVIDER="api_football", API_FOOTBALL_KEY="test-key")
def test_get_raises_provider_error_after_max_retries(api_provider):
    """Persistent failures exhaust retries and raise ProviderError."""
    from core.providers.api_football import ProviderError

    session = MagicMock()
    session.get.side_effect = requests.exceptions.RequestException("timeout")
    api_provider._session = session

    with pytest.raises(ProviderError):
        api_provider.get_live_scores()


@override_settings(PROVIDER="api_football", API_FOOTBALL_KEY="test-key")
def test_get_retries_on_429_status(api_provider):
    """HTTP 429 triggers retry; success on third attempt."""
    from core.providers.base import FixtureDTO

    envelope = _load_envelope("live_scores.json")

    resp_429 = MagicMock()
    resp_429.status_code = 429
    resp_429.raise_for_status.return_value = None

    good_response = _fake_response(envelope)

    session = MagicMock()
    session.get.side_effect = [resp_429, resp_429, good_response]
    api_provider._session = session

    result = api_provider.get_live_scores()

    assert session.get.call_count == 3
    assert len(result) > 0


@override_settings(PROVIDER="api_football", API_FOOTBALL_KEY="test-key")
def test_get_retries_on_5xx_status(api_provider):
    """HTTP 5xx triggers retry; raises ProviderError after max retries."""
    from core.providers.api_football import ProviderError

    resp_500 = MagicMock()
    resp_500.status_code = 500
    resp_500.raise_for_status.return_value = None

    session = MagicMock()
    session.get.return_value = resp_500
    api_provider._session = session

    with pytest.raises(ProviderError):
        api_provider.get_live_scores()


# ---------------------------------------------------------------------------
# Malformed item skipping
# ---------------------------------------------------------------------------

@override_settings(PROVIDER="api_football", API_FOOTBALL_KEY="test-key")
def test_malformed_fixture_item_skipped_good_ones_returned(api_provider):
    """A fixture item missing 'teams' is skipped; valid items still returned."""
    good_item = _load_envelope("live_scores.json")["response"][0]
    malformed_item = {"fixture": {"id": 9999, "status": {"short": "NS"}, "date": "2024-01-01T00:00:00+00:00"}}
    # missing "teams" and "league" → normalize_fixture will KeyError

    envelope = {
        "errors": [],
        "response": [malformed_item, good_item],
    }
    api_provider._session = _fake_session(envelope)

    result = api_provider.get_live_scores()

    # Bad item skipped; good item returned
    assert len(result) == 1
    assert result[0].home == "Manchester United"


# ---------------------------------------------------------------------------
# Provider factory
# ---------------------------------------------------------------------------

@override_settings(PROVIDER="api_football", API_FOOTBALL_KEY="test-key")
def test_get_provider_api_football_returns_real_provider():
    """get_provider() with PROVIDER='api_football' returns ApiFootballProvider, no NotImplementedError."""
    from core.providers import get_provider
    from core.providers.api_football import ApiFootballProvider

    provider = get_provider()
    assert isinstance(provider, ApiFootballProvider)


@override_settings(PROVIDER="mock")
def test_get_provider_mock_still_works():
    """get_provider() still returns MockProvider for 'mock'."""
    from core.providers import get_provider
    from core.providers.mock import MockProvider

    provider = get_provider()
    assert isinstance(provider, MockProvider)


@override_settings(PROVIDER="unknown")
def test_get_provider_unknown_still_raises_value_error():
    """get_provider() still raises ValueError for unknown providers."""
    from core.providers import get_provider

    with pytest.raises(ValueError, match="unknown"):
        get_provider()


# ---------------------------------------------------------------------------
# Auth header is sent
# ---------------------------------------------------------------------------

@override_settings(PROVIDER="api_football", API_FOOTBALL_KEY="test-key")
def test_auth_header_sent_in_request(api_provider):
    """_get sends x-apisports-key header with the API key."""
    envelope = {"errors": [], "response": []}
    session = MagicMock()
    session.get.return_value = _fake_response(envelope)
    api_provider._session = session

    api_provider.get_live_scores()

    assert session.get.called
    _, kwargs = session.get.call_args
    headers = kwargs.get("headers", {})
    assert headers.get("x-apisports-key") == "test-key"
