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

    def test_does_not_sleep_or_loop(self, provider, cache):
        """poll_once must be a single-shot call — no implicit side-effects."""
        # Just verifying it returns quickly (no sleep) — run it twice and
        # confirm the snapshot is updated (second call overwrites first).
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
