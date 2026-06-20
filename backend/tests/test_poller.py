"""
Tests for core/poller.py — TDD-first, uses fakeredis (no real Redis required).

Scope: poll_once, acquire_leadership, renew_leadership, run_loop(max_cycles=N).
The infinite loop body is NOT tested directly per project constraint.
"""
import fakeredis
import pytest

from core.cache import SnapshotCache
from core.providers.mock import MockProvider
from core.poller import (
    acquire_leadership,
    poll_once,
    renew_leadership,
    run_loop,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def fake_redis():
    """Fresh fakeredis server per test — fully isolated."""
    return fakeredis.FakeRedis()


@pytest.fixture()
def cache(fake_redis):
    return SnapshotCache(fake_redis)


@pytest.fixture()
def provider():
    return MockProvider()


# ---------------------------------------------------------------------------
# poll_once tests
# ---------------------------------------------------------------------------

class TestPollOnce:
    def test_writes_live_scores_snapshot(self, provider, cache):
        result = poll_once(provider, cache)
        snapshot = cache.get_snapshot("live_scores")
        assert snapshot is not None, "snapshot must exist after poll_once"
        assert isinstance(snapshot["payload"], list)
        assert len(snapshot["payload"]) > 0

    def test_returns_list_written(self, provider, cache):
        result = poll_once(provider, cache)
        assert isinstance(result, list)
        assert len(result) > 0

    def test_snapshot_payload_items_are_dicts_with_expected_keys(self, provider, cache):
        poll_once(provider, cache)
        items = cache.get_snapshot("live_scores")["payload"]
        required_keys = {"id", "home", "away", "status"}
        for item in items:
            assert isinstance(item, dict), "each item must be a plain dict"
            missing = required_keys - item.keys()
            assert not missing, f"item missing keys: {missing}"

    def test_poll_once_overwrites_snapshot(self, provider, cache):
        """Each call to poll_once overwrites the previous snapshot."""
        poll_once(provider, cache)
        snap1 = cache.get_snapshot("live_scores")
        poll_once(provider, cache)
        snap2 = cache.get_snapshot("live_scores")
        assert snap2["updated_at"] >= snap1["updated_at"]


# ---------------------------------------------------------------------------
# acquire_leadership tests
# ---------------------------------------------------------------------------

class TestAcquireLeadership:
    def test_first_caller_acquires(self, fake_redis):
        result = acquire_leadership(fake_redis, token="A", lease_ttl=30)
        assert result is True

    def test_second_caller_blocked(self, fake_redis):
        acquire_leadership(fake_redis, token="A", lease_ttl=30)
        result = acquire_leadership(fake_redis, token="B", lease_ttl=30)
        assert result is False

    def test_same_token_returns_false_when_key_exists(self, fake_redis):
        """SETNX: even the same token cannot re-acquire; use renew_leadership instead."""
        acquire_leadership(fake_redis, token="A", lease_ttl=30)
        result = acquire_leadership(fake_redis, token="A", lease_ttl=30)
        # After lease is set, NX means another SET with same key fails regardless of token.
        assert result is False

    def test_auto_token_generated_when_none(self, fake_redis):
        """Passing token=None should still succeed (generates uuid internally)."""
        result = acquire_leadership(fake_redis, lease_ttl=30, token=None)
        assert result is True


# ---------------------------------------------------------------------------
# renew_leadership tests
# ---------------------------------------------------------------------------

class TestRenewLeadership:
    def test_holder_can_renew(self, fake_redis):
        acquire_leadership(fake_redis, token="A", lease_ttl=30)
        result = renew_leadership(fake_redis, token="A", lease_ttl=30)
        assert result is True

    def test_non_holder_cannot_renew(self, fake_redis):
        acquire_leadership(fake_redis, token="A", lease_ttl=30)
        result = renew_leadership(fake_redis, token="B", lease_ttl=30)
        assert result is False

    def test_renew_on_missing_key_returns_false(self, fake_redis):
        result = renew_leadership(fake_redis, token="A", lease_ttl=30)
        assert result is False


# ---------------------------------------------------------------------------
# run_loop tests
# ---------------------------------------------------------------------------

class TestRunLoop:
    def test_two_cycles_without_hanging(self, provider, cache, fake_redis):
        """run_loop with max_cycles=2 must finish and have written a snapshot."""
        cycles = []

        def counting_sleep(s):
            cycles.append(s)

        run_loop(
            provider=provider,
            cache=cache,
            redis_client=fake_redis,
            token="test-token",
            interval=20,
            max_cycles=2,
            sleep_fn=counting_sleep,
        )

        assert len(cycles) == 2, f"expected 2 sleep calls, got {len(cycles)}"
        snapshot = cache.get_snapshot("live_scores")
        assert snapshot is not None
        assert len(snapshot["payload"]) > 0

    def test_one_cycle(self, provider, cache, fake_redis):
        slept = []
        run_loop(
            provider=provider,
            cache=cache,
            redis_client=fake_redis,
            token="tok",
            interval=5,
            max_cycles=1,
            sleep_fn=lambda s: slept.append(s),
        )
        assert len(slept) == 1
        assert cache.get_snapshot("live_scores") is not None

    def test_sleep_called_with_interval(self, provider, cache, fake_redis):
        slept_with = []
        run_loop(
            provider=provider,
            cache=cache,
            redis_client=fake_redis,
            token="tok",
            interval=42,
            max_cycles=1,
            sleep_fn=lambda s: slept_with.append(s),
        )
        assert slept_with == [42]

    def test_fixtures_step_failure_does_not_skip_refresh_active_matches(
        self, cache, fake_redis
    ):
        """
        Isolation: if poll_fixtures_once raises (provider.get_fixtures throws),
        run_loop must still complete (return True), poll_once must still have
        written live_scores, and refresh_active_matches must still have been
        invoked (proven via a spy counter on the provider stub).
        """
        import dataclasses

        # Minimal FixtureDTO-compatible dataclass so poll_once can serialise it.
        @dataclasses.dataclass
        class _FakeDTO:
            id: int = 1
            home: str = "Home FC"
            away: str = "Away FC"
            status: str = "LIVE"

        refresh_call_count = []

        class _BrokenFixturesProvider:
            """poll_once succeeds, get_fixtures raises, refresh_active_matches is tracked."""

            def get_live_scores(self):
                return [_FakeDTO()]

            def get_fixtures(self, date: str):
                raise RuntimeError("transient provider error — fixtures unavailable")

            # refresh_active_matches (core/match_detail.py) calls provider internally;
            # we track it via a monkeypatch on the module below instead.

        stub_provider = _BrokenFixturesProvider()

        # Patch refresh_active_matches in the poller module so we can count calls
        # without needing a real match-detail sub-system.
        import core.poller as poller_module

        original_refresh = poller_module.refresh_active_matches

        def _spy_refresh(provider, cache):
            refresh_call_count.append(1)

        poller_module.refresh_active_matches = _spy_refresh
        try:
            result = run_loop(
                provider=stub_provider,
                cache=cache,
                redis_client=fake_redis,
                token="isolation-tok",
                interval=0,
                max_cycles=1,
                sleep_fn=lambda s: None,
            )
        finally:
            poller_module.refresh_active_matches = original_refresh

        # Loop completed normally despite the middle step throwing.
        assert result is True, "run_loop must return True (was-leader) even when fixtures step fails"

        # poll_once succeeded → live_scores snapshot must exist.
        snapshot = cache.get_snapshot("live_scores")
        assert snapshot is not None, "live_scores snapshot must be written even when fixtures step fails"

        # refresh_active_matches was still called despite the fixtures step failing.
        assert len(refresh_call_count) == 1, (
            "refresh_active_matches must still be invoked when poll_fixtures_once raises"
        )
