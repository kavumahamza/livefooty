"""
TDD tests for core/cache.py — Redis snapshot store with staleness tracking.
All tests use fakeredis; no real Redis server required.
"""
import fakeredis
import pytest

from core.cache import SnapshotCache


@pytest.fixture
def fake_redis():
    return fakeredis.FakeStrictRedis()


# ---------------------------------------------------------------------------
# Round-trip: dict payload
# ---------------------------------------------------------------------------

def test_round_trip_dict(fake_redis):
    """set_snapshot → get_snapshot returns same payload and correct age_seconds."""
    write_time = 1000.0
    read_time = 1075.0

    cache = SnapshotCache(fake_redis, now_fn=lambda: write_time)
    cache.set_snapshot("match:1", {"score": "2-1", "minute": 88})

    # advance clock for the read
    cache._now_fn = lambda: read_time
    result = cache.get_snapshot("match:1")

    assert result is not None
    assert result["payload"] == {"score": "2-1", "minute": 88}
    assert result["updated_at"] == write_time
    assert result["age_seconds"] == pytest.approx(75.0)


# ---------------------------------------------------------------------------
# Round-trip: list payload
# ---------------------------------------------------------------------------

def test_round_trip_list(fake_redis):
    """A list payload (e.g. fixture dicts) round-trips without corruption."""
    fixtures = [
        {"id": 1, "home": "Arsenal", "away": "Chelsea"},
        {"id": 2, "home": "Liverpool", "away": "City"},
    ]
    cache = SnapshotCache(fake_redis, now_fn=lambda: 500.0)
    cache.set_snapshot("fixtures:today", fixtures)

    result = cache.get_snapshot("fixtures:today")
    assert result is not None
    assert result["payload"] == fixtures


# ---------------------------------------------------------------------------
# is_stale
# ---------------------------------------------------------------------------

def test_is_stale_past_threshold(fake_redis):
    """age_seconds > max_age → is_stale returns True."""
    cache = SnapshotCache(fake_redis, now_fn=lambda: 1000.0)
    cache.set_snapshot("match:2", {"foo": "bar"})

    cache._now_fn = lambda: 1075.0  # age = 75
    assert cache.is_stale("match:2", max_age=60.0) is True


def test_is_stale_within_threshold(fake_redis):
    """age_seconds <= max_age → is_stale returns False."""
    cache = SnapshotCache(fake_redis, now_fn=lambda: 1000.0)
    cache.set_snapshot("match:3", {"foo": "bar"})

    cache._now_fn = lambda: 1075.0  # age = 75
    assert cache.is_stale("match:3", max_age=120.0) is False


def test_is_stale_exactly_at_threshold(fake_redis):
    """age_seconds == max_age → NOT stale (boundary is exclusive on the stale side)."""
    cache = SnapshotCache(fake_redis, now_fn=lambda: 1000.0)
    cache.set_snapshot("match:4", {"x": 1})

    cache._now_fn = lambda: 1060.0  # age = 60
    # age_seconds (60) > max_age (60) is False → not stale
    assert cache.is_stale("match:4", max_age=60.0) is False


# ---------------------------------------------------------------------------
# Absent key
# ---------------------------------------------------------------------------

def test_get_snapshot_absent_key_returns_none(fake_redis):
    cache = SnapshotCache(fake_redis, now_fn=lambda: 1000.0)
    assert cache.get_snapshot("nonexistent:key") is None


def test_is_stale_absent_key_returns_true(fake_redis):
    cache = SnapshotCache(fake_redis, now_fn=lambda: 1000.0)
    assert cache.is_stale("nonexistent:key", max_age=60.0) is True


# ---------------------------------------------------------------------------
# Overwrite: most recent write wins
# ---------------------------------------------------------------------------

def test_overwrite_updates_timestamp(fake_redis):
    cache = SnapshotCache(fake_redis, now_fn=lambda: 1000.0)
    cache.set_snapshot("match:5", {"v": 1})

    cache._now_fn = lambda: 1050.0
    cache.set_snapshot("match:5", {"v": 2})

    cache._now_fn = lambda: 1060.0
    result = cache.get_snapshot("match:5")

    assert result["payload"] == {"v": 2}
    assert result["updated_at"] == 1050.0
    assert result["age_seconds"] == pytest.approx(10.0)
