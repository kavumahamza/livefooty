"""
Tests for core/match_detail.py

Uses fakeredis (no real Redis) and a SpyProvider that records how many times
each provider endpoint has been called per fixture id.

Test coverage
-------------
1. refresh_detail_if_stale called twice within TTL window hits each provider
   endpoint EXACTLY ONCE (call counts stay at 1).

2. After advancing now_fn past events TTL (+50 s) but not stats TTL, a third
   call refreshes events (count → 2) but NOT stats (still 1).  Proves per-
   resource TTL independence.

3. mark_active → list_active returns [that id]; second id marked → list_active
   returns both; a third id that was never marked is absent.

4. refresh_active_matches with two active ids → match_detail:<id> exists for
   each.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import fakeredis
import pytest

from core.cache import SnapshotCache
from core.match_detail import (
    EVENTS_TTL,
    LINEUPS_TTL,
    STATS_TTL,
    list_active,
    mark_active,
    refresh_active_matches,
    refresh_detail_if_stale,
)
from core.providers.base import BaseProvider, EventDTO, FixtureDTO, StatsDTO


# ---------------------------------------------------------------------------
# Spy provider — records call counts per fixture_id for each endpoint
# ---------------------------------------------------------------------------

class SpyProvider(BaseProvider):
    """
    Minimal provider that records how many times each endpoint was called for
    each fixture_id.  Returns deterministic stub data so the assembler does
    not crash.
    """

    def __init__(self):
        self.events_calls: dict[int, int] = {}
        self.stats_calls: dict[int, int] = {}
        self.lineups_calls: dict[int, int] = {}

    # Required BaseProvider methods that are not under test here
    def get_fixtures(self, date: str) -> list[FixtureDTO]:
        return []

    def get_live_scores(self) -> list[FixtureDTO]:
        return []

    def get_events(self, fixture_id: int) -> list[EventDTO]:
        self.events_calls[fixture_id] = self.events_calls.get(fixture_id, 0) + 1
        return [
            EventDTO(
                minute=10,
                type="goal",
                detail="Normal Goal",
                team="Home FC",
                player="Player One",
                assist=None,
            )
        ]

    def get_stats(self, fixture_id: int) -> StatsDTO | None:
        self.stats_calls[fixture_id] = self.stats_calls.get(fixture_id, 0) + 1
        return StatsDTO(possession_home=55, possession_away=45)

    def get_lineups(self, fixture_id: int) -> dict | None:
        self.lineups_calls[fixture_id] = self.lineups_calls.get(fixture_id, 0) + 1
        return {"home": ["Player A"], "away": ["Player B"]}


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def fake_redis():
    """Fresh fakeredis instance per test — fully isolated."""
    return fakeredis.FakeRedis()


@pytest.fixture()
def cache(fake_redis):
    return SnapshotCache(fake_redis)


@pytest.fixture()
def spy():
    return SpyProvider()


# ---------------------------------------------------------------------------
# Test 1 & 2: per-resource TTL independence
# ---------------------------------------------------------------------------

class TestRefreshDetailIfStale:
    def test_first_call_fetches_all_endpoints(self, spy, cache):
        """Initial call must fetch events, stats, and lineups."""
        fixture_id = 1001
        now = 0.0
        refresh_detail_if_stale(spy, cache, fixture_id, now_fn=lambda: now)

        assert spy.events_calls.get(fixture_id, 0) == 1, "events must be fetched once"
        assert spy.stats_calls.get(fixture_id, 0) == 1, "stats must be fetched once"
        assert spy.lineups_calls.get(fixture_id, 0) == 1, "lineups must be fetched once"

    def test_second_call_within_ttl_does_not_re_fetch(self, spy, cache):
        """
        Two calls at the SAME logical time (same now_fn) must result in exactly
        ONE provider call per endpoint — the second call is served from cache.
        """
        fixture_id = 1001
        now = 0.0

        refresh_detail_if_stale(spy, cache, fixture_id, now_fn=lambda: now)
        refresh_detail_if_stale(spy, cache, fixture_id, now_fn=lambda: now)

        assert spy.events_calls.get(fixture_id) == 1, (
            f"events should be fetched exactly once; got {spy.events_calls.get(fixture_id)}"
        )
        assert spy.stats_calls.get(fixture_id) == 1, (
            f"stats should be fetched exactly once; got {spy.stats_calls.get(fixture_id)}"
        )
        assert spy.lineups_calls.get(fixture_id) == 1, (
            f"lineups should be fetched exactly once; got {spy.lineups_calls.get(fixture_id)}"
        )

    def test_advancing_past_events_ttl_refreshes_events_only(self, spy, cache):
        """
        After advancing now_fn by +50 s (past events TTL=45 s but below
        stats TTL=90 s and lineups TTL=1800 s), only events should be
        re-fetched on the third call.
        """
        fixture_id = 1001
        t = [0.0]  # mutable so the lambda can mutate it

        # Call 1: populate all resources at t=0
        refresh_detail_if_stale(spy, cache, fixture_id, now_fn=lambda: t[0])

        # Call 2: same time → nothing re-fetched
        refresh_detail_if_stale(spy, cache, fixture_id, now_fn=lambda: t[0])

        # Advance time past events TTL (45 s) but not stats TTL (90 s)
        t[0] = EVENTS_TTL + 5  # 50 s

        # Call 3: events TTL exceeded → events re-fetched; stats and lineups not
        refresh_detail_if_stale(spy, cache, fixture_id, now_fn=lambda: t[0])

        assert spy.events_calls.get(fixture_id) == 2, (
            f"events should have been refreshed (count=2); got {spy.events_calls.get(fixture_id)}"
        )
        assert spy.stats_calls.get(fixture_id) == 1, (
            f"stats should NOT have been refreshed (still count=1); got {spy.stats_calls.get(fixture_id)}"
        )
        assert spy.lineups_calls.get(fixture_id) == 1, (
            f"lineups should NOT have been refreshed (still count=1); got {spy.lineups_calls.get(fixture_id)}"
        )

    def test_assembled_detail_written_to_cache(self, spy, cache):
        """match_detail:<id> must be written to cache with expected shape."""
        fixture_id = 2002
        now = 0.0
        detail = refresh_detail_if_stale(spy, cache, fixture_id, now_fn=lambda: now)

        # Check return value shape
        assert detail["fixture_id"] == fixture_id
        assert isinstance(detail["events"], list)
        # stats and lineups may be None or dict/list
        assert "stats" in detail
        assert "lineups" in detail

        # Check cache was written
        snap = cache.get_snapshot(f"match_detail:{fixture_id}")
        assert snap is not None, "match_detail key must exist in cache"
        assert snap["payload"]["fixture_id"] == fixture_id

    def test_advancing_past_stats_ttl_refreshes_stats(self, spy, cache):
        """After +95 s, stats should also be re-fetched."""
        fixture_id = 3003
        t = [0.0]

        refresh_detail_if_stale(spy, cache, fixture_id, now_fn=lambda: t[0])

        t[0] = STATS_TTL + 5  # 95 s — past both events (45) and stats (90)

        refresh_detail_if_stale(spy, cache, fixture_id, now_fn=lambda: t[0])

        assert spy.events_calls.get(fixture_id) == 2, "events must refresh after events TTL"
        assert spy.stats_calls.get(fixture_id) == 2, "stats must refresh after stats TTL"
        assert spy.lineups_calls.get(fixture_id) == 1, "lineups must NOT refresh yet"


# ---------------------------------------------------------------------------
# Test 3: active-match registry
# ---------------------------------------------------------------------------

class TestActiveMatchRegistry:
    def test_mark_and_list_single_id(self, cache):
        mark_active(cache, 42)
        active = list_active(cache)
        assert 42 in active

    def test_mark_two_ids_list_returns_both(self, cache):
        mark_active(cache, 100)
        mark_active(cache, 200)
        active = list_active(cache)
        assert 100 in active
        assert 200 in active

    def test_unmarked_id_not_in_list(self, cache):
        mark_active(cache, 555)
        active = list_active(cache)
        assert 999 not in active, "unmarked fixture_id must not appear in list_active"

    def test_empty_registry_returns_empty_list(self, cache):
        active = list_active(cache)
        assert active == []

    def test_expired_key_not_in_list(self, fake_redis, cache):
        """A key written with ttl=1 should vanish once manually expired in fakeredis."""
        # Write with a tiny TTL
        mark_active(cache, 77, ttl=1)
        assert 77 in list_active(cache)

        # Simulate expiry by deleting the key directly (fakeredis doesn't auto-expire
        # without a server loop, so we mimic expiry via delete)
        fake_redis.delete("active_match:77")
        assert 77 not in list_active(cache)


# ---------------------------------------------------------------------------
# Test 4: refresh_active_matches refreshes all active ids
# ---------------------------------------------------------------------------

class TestRefreshActiveMatches:
    def test_refreshes_all_active_ids(self, spy, cache):
        """Two active ids → match_detail keys exist for both after refresh."""
        mark_active(cache, 1)
        mark_active(cache, 2)

        refresh_active_matches(spy, cache)

        snap1 = cache.get_snapshot("match_detail:1")
        snap2 = cache.get_snapshot("match_detail:2")

        assert snap1 is not None, "match_detail:1 must be written"
        assert snap1["payload"]["fixture_id"] == 1

        assert snap2 is not None, "match_detail:2 must be written"
        assert snap2["payload"]["fixture_id"] == 2

    def test_inactive_id_not_refreshed(self, spy, cache):
        """Only marked ids get refreshed; unmarked ids are absent from cache."""
        mark_active(cache, 10)
        # 20 is NOT marked

        refresh_active_matches(spy, cache)

        assert cache.get_snapshot("match_detail:10") is not None
        assert cache.get_snapshot("match_detail:20") is None

    def test_no_active_ids_no_provider_calls(self, spy, cache):
        """With no active matches, the provider must not be called at all."""
        refresh_active_matches(spy, cache)

        assert not spy.events_calls, "no provider calls expected with empty registry"
        assert not spy.stats_calls
        assert not spy.lineups_calls
