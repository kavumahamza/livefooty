"""
TDD tests for Task 3.1 — cache-backed REST endpoints.

Strategy:
- Use Django test Client (works without DRF APIClient being separately installed).
- Inject a fakeredis-backed SnapshotCache by monkeypatching core.views.get_cache.
- Pre-populate the cache in each test using set_snapshot directly.
- Never call real Redis or any provider in the request path.
"""
from __future__ import annotations

import json
import time

import fakeredis
import pytest
from django.test import Client

from core.cache import SnapshotCache


# ---------------------------------------------------------------------------
# Shared fixture helpers
# ---------------------------------------------------------------------------

FIXTURE_PL_1 = {
    "id": 100,
    "league": "Premier League",
    "league_id": 39,
    "home": "Arsenal",
    "away": "Chelsea",
    "home_score": 1,
    "away_score": 0,
    "status": "1H",
    "minute": 32,
    "kickoff_utc": "2026-06-20T15:00:00Z",
}

FIXTURE_PL_2 = {
    "id": 101,
    "league": "Premier League",
    "league_id": 39,
    "home": "Liverpool",
    "away": "Man City",
    "home_score": None,
    "away_score": None,
    "status": "NS",
    "minute": None,
    "kickoff_utc": "2026-06-20T17:30:00Z",
}

FIXTURE_LIGA = {
    "id": 200,
    "league": "La Liga",
    "league_id": 140,
    "home": "Barcelona",
    "away": "Real Madrid",
    "home_score": 2,
    "away_score": 1,
    "status": "2H",
    "minute": 65,
    "kickoff_utc": "2026-06-20T19:00:00Z",
}

DETAIL_100 = {
    "fixture_id": 100,
    "events": [
        {"minute": 32, "type": "goal", "detail": "Normal Goal", "team": "Arsenal", "player": "Saka", "assist": None},
        {"minute": 15, "type": "card", "detail": "Yellow Card", "team": "Chelsea", "player": "Chilwell", "assist": None},
    ],
    "stats": {
        "possession_home": 55,
        "possession_away": 45,
        "shots_home": 8,
        "shots_away": 5,
        "attacks_home": 60,
        "attacks_away": 40,
        "dangerous_home": 20,
        "dangerous_away": 10,
    },
    "lineups": None,
}


@pytest.fixture()
def fake_redis():
    return fakeredis.FakeRedis()


@pytest.fixture()
def cache(fake_redis):
    return SnapshotCache(fake_redis, now_fn=time.time)


@pytest.fixture()
def client():
    return Client()


@pytest.fixture(autouse=True)
def patch_get_cache(monkeypatch, cache):
    """Inject our fakeredis-backed cache into core.views so no real Redis is used."""
    import core.views as views_mod
    monkeypatch.setattr(views_mod, "get_cache", lambda: cache)


# ---------------------------------------------------------------------------
# /api/fixtures tests
# ---------------------------------------------------------------------------

class TestFixturesEndpoint:
    def test_fixtures_filter_by_league_id(self, client, cache):
        """?league=39 returns only PL fixtures (id 100, 101), not La Liga (id 200)."""
        cache.set_snapshot("fixtures", [FIXTURE_PL_1, FIXTURE_PL_2, FIXTURE_LIGA])

        resp = client.get("/api/fixtures?league=39")
        assert resp.status_code == 200

        data = resp.json()
        ids = [f["id"] for f in data["fixtures"]]
        assert 100 in ids
        assert 101 in ids
        assert 200 not in ids

    def test_fixtures_filter_by_league_name(self, client, cache):
        """?league=La Liga matches by league name contains."""
        cache.set_snapshot("fixtures", [FIXTURE_PL_1, FIXTURE_LIGA])

        resp = client.get("/api/fixtures?league=La+Liga")
        assert resp.status_code == 200

        ids = [f["id"] for f in resp.json()["fixtures"]]
        assert 200 in ids
        assert 100 not in ids

    def test_fixtures_unknown_league_returns_empty_not_500(self, client, cache):
        """Unknown league filter → 200 with empty list, not 500."""
        cache.set_snapshot("fixtures", [FIXTURE_PL_1, FIXTURE_LIGA])

        resp = client.get("/api/fixtures?league=99999")
        assert resp.status_code == 200
        assert resp.json()["fixtures"] == []

    def test_fixtures_cold_cache_returns_200_empty_null_age(self, client, cache):
        """No 'fixtures' snapshot → 200, fixtures=[], age_seconds=null."""
        # Do NOT set snapshot — cache is cold
        resp = client.get("/api/fixtures")
        assert resp.status_code == 200
        data = resp.json()
        assert data["fixtures"] == []
        assert data["age_seconds"] is None

    def test_fixtures_no_filter_returns_all(self, client, cache):
        """No filter params → all fixtures returned."""
        cache.set_snapshot("fixtures", [FIXTURE_PL_1, FIXTURE_PL_2, FIXTURE_LIGA])

        resp = client.get("/api/fixtures")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["fixtures"]) == 3

    def test_fixtures_filter_by_team(self, client, cache):
        """?team=Arsenal matches home/away name contains."""
        cache.set_snapshot("fixtures", [FIXTURE_PL_1, FIXTURE_LIGA])

        resp = client.get("/api/fixtures?team=Arsenal")
        assert resp.status_code == 200
        ids = [f["id"] for f in resp.json()["fixtures"]]
        assert 100 in ids
        assert 200 not in ids

    def test_fixtures_filter_by_date(self, client, cache):
        """?date=2026-06-20 matches fixture's kickoff_utc date prefix."""
        cache.set_snapshot("fixtures", [FIXTURE_PL_1, FIXTURE_LIGA])

        resp = client.get("/api/fixtures?date=2026-06-20")
        assert resp.status_code == 200
        # Both have 2026-06-20 in kickoff_utc
        assert len(resp.json()["fixtures"]) == 2

    def test_fixtures_response_has_updated_at_and_age_seconds(self, client, cache):
        """Response includes updated_at and age_seconds fields."""
        cache.set_snapshot("fixtures", [FIXTURE_PL_1])

        resp = client.get("/api/fixtures")
        data = resp.json()
        assert "updated_at" in data
        assert "age_seconds" in data
        assert isinstance(data["age_seconds"], (int, float))


# ---------------------------------------------------------------------------
# /api/live tests
# ---------------------------------------------------------------------------

class TestLiveEndpoint:
    def test_live_returns_seeded_fixtures_with_age(self, client, cache):
        """Returns the live_scores snapshot with age_seconds present."""
        cache.set_snapshot("live_scores", [FIXTURE_PL_1, FIXTURE_LIGA])

        resp = client.get("/api/live")
        assert resp.status_code == 200
        data = resp.json()

        assert len(data["fixtures"]) == 2
        assert data["age_seconds"] is not None
        assert isinstance(data["age_seconds"], (int, float))
        assert "updated_at" in data

    def test_live_cold_cache_returns_200_empty_null_age(self, client, cache):
        """Cold cache → 200, fixtures=[], age_seconds=null."""
        resp = client.get("/api/live")
        assert resp.status_code == 200
        data = resp.json()
        assert data["fixtures"] == []
        assert data["age_seconds"] is None

    def test_live_fixture_keys_present(self, client, cache):
        """Each fixture in live response has required fields."""
        cache.set_snapshot("live_scores", [FIXTURE_PL_1])

        resp = client.get("/api/live")
        fixture = resp.json()["fixtures"][0]
        for key in ("id", "home", "away", "status"):
            assert key in fixture, f"Missing key: {key}"


# ---------------------------------------------------------------------------
# /api/match/<id> tests
# ---------------------------------------------------------------------------

class TestMatchDetailEndpoint:
    def test_match_detail_returns_full_payload(self, client, cache):
        """Pre-seed match_detail + live_scores; response has detail.events, momentum, fixture."""
        cache.set_snapshot("live_scores", [FIXTURE_PL_1])
        cache.set_snapshot("match_detail:100", DETAIL_100)

        resp = client.get("/api/match/100")
        assert resp.status_code == 200
        data = resp.json()

        assert data["fixture_id"] == 100
        assert data["fixture"] is not None
        assert data["fixture"]["home"] == "Arsenal"
        assert data["fixture"]["away"] == "Chelsea"
        assert "events" in data["detail"]
        assert len(data["detail"]["events"]) == 2

    def test_match_detail_momentum_shape(self, client, cache):
        """Momentum has mode in {stats,events} and exactly 18 buckets."""
        cache.set_snapshot("live_scores", [FIXTURE_PL_1])
        cache.set_snapshot("match_detail:100", DETAIL_100)

        resp = client.get("/api/match/100")
        momentum = resp.json()["momentum"]

        assert momentum["mode"] in ("stats", "events")
        assert len(momentum["buckets"]) == 18
        assert "caption" in momentum

    def test_match_detail_marks_active(self, client, cache, fake_redis):
        """Calling /api/match/<id> must write active_match:<id> key."""
        cache.set_snapshot("live_scores", [FIXTURE_PL_1])
        cache.set_snapshot("match_detail:100", DETAIL_100)

        resp = client.get("/api/match/100")
        assert resp.status_code == 200

        # mark_active writes "active_match:100" with a TTL
        active_key = fake_redis.get("active_match:100")
        assert active_key is not None, "active_match:100 key must be set by mark_active"

    def test_match_unknown_id_returns_200_empty_shell(self, client, cache, fake_redis):
        """Unknown fixture_id → 200, empty shell detail, valid momentum, active key set."""
        # No match_detail:999, no live_scores seed
        resp = client.get("/api/match/999")
        assert resp.status_code == 200
        data = resp.json()

        assert data["fixture_id"] == 999
        assert data["fixture"] is None
        # detail is empty shell
        assert data["detail"]["events"] == []
        assert data["detail"]["stats"] is None
        assert data["detail"]["lineups"] is None
        # momentum still valid (18 buckets)
        assert len(data["momentum"]["buckets"]) == 18
        # age_seconds is null when no snapshot
        assert data["age_seconds"] is None
        # active key still set
        assert fake_redis.get("active_match:999") is not None

    def test_match_detail_age_seconds_present(self, client, cache):
        """age_seconds is a float when detail snapshot exists."""
        cache.set_snapshot("live_scores", [FIXTURE_PL_1])
        cache.set_snapshot("match_detail:100", DETAIL_100)

        resp = client.get("/api/match/100")
        data = resp.json()
        assert data["age_seconds"] is not None
        assert isinstance(data["age_seconds"], (int, float))

    def test_match_detail_fixture_lookup_from_fixtures_snapshot(self, client, cache):
        """If fixture not in live_scores, look in fixtures snapshot."""
        # Only seed fixtures snapshot, not live_scores
        cache.set_snapshot("fixtures", [FIXTURE_PL_1])
        cache.set_snapshot("match_detail:100", DETAIL_100)

        resp = client.get("/api/match/100")
        data = resp.json()
        # Should still find the fixture
        assert data["fixture"] is not None
        assert data["fixture"]["home"] == "Arsenal"
