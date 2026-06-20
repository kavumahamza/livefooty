"""Real API-Football v3 provider (Task 5.0).

Fetches live data from api-sports.io, normalizes via core.normalize, and
returns provider DTOs. Designed for dependency injection: pass a custom
session and sleep_fn so tests can mock HTTP without network calls.
"""
from __future__ import annotations

import logging
import time
from typing import Callable

import requests
from django.conf import settings

from core.normalize import (
    normalize_event,
    normalize_fixture,
    normalize_lineups,
    normalize_stats,
)
from core.providers.base import BaseProvider, EventDTO, FixtureDTO, StatsDTO

logger = logging.getLogger(__name__)

_DEFAULT_BASE_URL = "https://v3.football.api-sports.io"
_MAX_RETRIES = 3
_RETRY_SLEEP = 1  # seconds between retries (overridden via sleep_fn in tests)


class ProviderError(Exception):
    """Raised when the API-Football provider cannot complete a request."""


class ApiFootballProvider(BaseProvider):
    """Live provider backed by API-Football v3."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        session: requests.Session | None = None,
        sleep_fn: Callable[[float], None] | None = None,
    ):
        self._api_key = api_key or getattr(settings, "API_FOOTBALL_KEY", "")
        self._base_url = (
            base_url
            or getattr(settings, "API_FOOTBALL_BASE_URL", _DEFAULT_BASE_URL)
        ).rstrip("/")
        self._session = session or requests.Session()
        self._sleep = sleep_fn if sleep_fn is not None else time.sleep

    # ------------------------------------------------------------------
    # Private HTTP helper
    # ------------------------------------------------------------------

    def _get(self, path: str, params: dict | None = None) -> list:
        """GET base_url+path, return the 'response' array.

        Retries up to _MAX_RETRIES times on:
          - requests.exceptions.RequestException
          - HTTP 429 or 5xx status codes

        On API-Football logical errors (errors field non-empty), returns [].
        Raises ProviderError after all retries exhausted.
        """
        url = self._base_url + path
        headers = {"x-apisports-key": self._api_key}
        last_exc: Exception | None = None

        for attempt in range(_MAX_RETRIES):
            try:
                resp = self._session.get(
                    url, headers=headers, params=params, timeout=10
                )
            except requests.exceptions.RequestException as exc:
                last_exc = exc
                logger.warning(
                    "ApiFootball request error (attempt %d/%d): %s",
                    attempt + 1,
                    _MAX_RETRIES,
                    exc,
                )
                if attempt < _MAX_RETRIES - 1:
                    self._sleep(_RETRY_SLEEP * (attempt + 1))
                continue

            # Transient HTTP errors → retry
            if resp.status_code in (429,) or resp.status_code >= 500:
                last_exc = ProviderError(
                    f"HTTP {resp.status_code} from API-Football"
                )
                logger.warning(
                    "ApiFootball HTTP %d (attempt %d/%d)",
                    resp.status_code,
                    attempt + 1,
                    _MAX_RETRIES,
                )
                if attempt < _MAX_RETRIES - 1:
                    self._sleep(_RETRY_SLEEP * (attempt + 1))
                continue

            # Parse JSON
            data = resp.json()

            # API-Football errors field (can be dict or list)
            errors = data.get("errors") or []
            if errors:
                logger.warning("ApiFootball errors field non-empty: %s", errors)
                return []

            return data.get("response") or []

        raise ProviderError(
            f"ApiFootball request to {url} failed after {_MAX_RETRIES} attempts: {last_exc}"
        )

    # ------------------------------------------------------------------
    # Public provider methods
    # ------------------------------------------------------------------

    def get_fixtures(self, date: str) -> list[FixtureDTO]:
        """GET /fixtures?date=<YYYY-MM-DD> → list[FixtureDTO]."""
        raw_items = self._get("/fixtures", params={"date": date})
        return self._safe_normalize_fixtures(raw_items)

    def get_live_scores(self) -> list[FixtureDTO]:
        """GET /fixtures?live=all → list[FixtureDTO]."""
        raw_items = self._get("/fixtures", params={"live": "all"})
        return self._safe_normalize_fixtures(raw_items)

    def get_events(self, fixture_id: int) -> list[EventDTO]:
        """GET /fixtures/events?fixture=<id> → list[EventDTO]."""
        raw_items = self._get("/fixtures/events", params={"fixture": fixture_id})
        result: list[EventDTO] = []
        for raw in raw_items:
            try:
                evt = normalize_event(raw)
                if evt is not None:
                    result.append(evt)
            except Exception as exc:
                logger.warning(
                    "Skipping malformed event for fixture %d: %s — %s",
                    fixture_id,
                    exc,
                    raw,
                )
        return result

    def get_stats(self, fixture_id: int) -> StatsDTO | None:
        """GET /fixtures/statistics?fixture=<id> → StatsDTO or None."""
        raw_items = self._get("/fixtures/statistics", params={"fixture": fixture_id})
        if not raw_items:
            return None
        try:
            return normalize_stats(raw_items)
        except Exception as exc:
            logger.warning(
                "Failed to normalize stats for fixture %d: %s", fixture_id, exc
            )
            return None

    def get_lineups(self, fixture_id: int) -> dict | None:
        """GET /fixtures/lineups?fixture=<id> → {"home":[names], "away":[names]} or None."""
        raw_items = self._get("/fixtures/lineups", params={"fixture": fixture_id})
        if not raw_items:
            return None
        try:
            return normalize_lineups(raw_items)
        except Exception as exc:
            logger.warning(
                "Failed to normalize lineups for fixture %d: %s", fixture_id, exc
            )
            return None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _safe_normalize_fixtures(self, raw_items: list) -> list[FixtureDTO]:
        """Normalize fixture items, skipping any that are malformed."""
        result: list[FixtureDTO] = []
        for raw in raw_items:
            try:
                result.append(normalize_fixture(raw))
            except Exception as exc:
                logger.warning(
                    "Skipping malformed fixture item: %s — %s", exc, raw
                )
        return result
