"""
Redis-backed snapshot store with staleness tracking.

Design:
- Each snapshot is stored as a single JSON envelope:
    {"payload": <JSON-serializable value>, "updated_at": <epoch float>}
  This keeps the write atomic (single SET) and the read atomic (single GET).

- The clock is injectable via `now_fn` so tests are fully deterministic.

- `get_cache()` lazily builds the production client from Django settings.
  Tests NEVER call get_cache(); they inject fakeredis.FakeStrictRedis() directly.

- cache.py is DTO-agnostic: callers are responsible for converting dataclasses
  to plain dicts (e.g. dataclasses.asdict) before passing to set_snapshot.
"""

import json
import time
from typing import Any, Callable

import redis


class SnapshotCache:
    """
    Thin wrapper around a Redis client providing JSON snapshot storage
    with creation-time tracking and staleness queries.

    Parameters
    ----------
    redis_client:
        Any redis-compatible client (redis.StrictRedis, fakeredis.FakeStrictRedis, …).
    now_fn:
        Zero-argument callable returning the current time as epoch seconds (float).
        Defaults to time.time. Override in tests for determinism.
    """

    def __init__(self, redis_client, now_fn: Callable[[], float] = time.time):
        self._redis = redis_client
        self._now_fn = now_fn

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def set_snapshot(self, key: str, payload: Any) -> None:
        """
        Serialize *payload* together with the current timestamp and store
        under *key*.  Overwrites any previous value.
        """
        envelope = {
            "payload": payload,
            "updated_at": self._now_fn(),
        }
        self._redis.set(key, json.dumps(envelope))

    def get_snapshot(self, key: str) -> dict | None:
        """
        Retrieve the snapshot stored at *key*.

        Returns
        -------
        dict with keys ``payload``, ``updated_at`` (epoch float), and
        ``age_seconds`` (seconds elapsed since the snapshot was written),
        or ``None`` if the key does not exist.
        """
        raw = self._redis.get(key)
        if raw is None:
            return None

        envelope: dict = json.loads(raw)
        updated_at: float = envelope["updated_at"]
        age_seconds: float = self._now_fn() - updated_at

        return {
            "payload": envelope["payload"],
            "updated_at": updated_at,
            "age_seconds": age_seconds,
        }

    def is_stale(self, key: str, max_age: float) -> bool:
        """
        Return True if the key is absent or its age exceeds *max_age* seconds.
        Equality (age == max_age) is treated as NOT stale.
        """
        snapshot = self.get_snapshot(key)
        if snapshot is None:
            return True
        return snapshot["age_seconds"] > max_age

    def set_with_ttl(self, key: str, payload: Any, ttl_seconds: int) -> None:
        """
        Like set_snapshot but also sets a Redis key TTL so the key expires
        automatically.  Useful for keys that should self-clean (e.g. live match
        data that is irrelevant after the match window).
        """
        envelope = {
            "payload": payload,
            "updated_at": self._now_fn(),
        }
        self._redis.set(key, json.dumps(envelope), ex=ttl_seconds)


# ---------------------------------------------------------------------------
# Module-level production accessor
# ---------------------------------------------------------------------------

_cache_instance: SnapshotCache | None = None


def get_cache() -> SnapshotCache:
    """
    Return the module-level production SnapshotCache, creating it on first
    call using the REDIS_URL from Django settings.

    Tests should NOT call this function — inject a fakeredis client directly
    into SnapshotCache(...) instead.
    """
    global _cache_instance
    if _cache_instance is None:
        from django.conf import settings  # deferred to avoid import-time side-effects

        client = redis.from_url(settings.REDIS_URL)
        _cache_instance = SnapshotCache(client)
    return _cache_instance
