"""
core/match_detail.py — Active-match registry and per-resource TTL-gated detail refresh.

Design
------
Ownership model:
    Clients NEVER call the provider directly.  When a client opens a match,
    the REST view calls mark_active(cache, fixture_id) to register interest by
    writing an ``active_match:<id>`` key with a 60-second TTL.  The poller
    process calls refresh_active_matches() each cycle, which internally calls
    refresh_detail_if_stale() for every fixture_id that has a live
    ``active_match:*`` key.  Expired keys drop out automatically via Redis TTL,
    so a match with no viewers stops being refreshed within one 60-second window.

Per-resource TTL gates (applied inside refresh_detail_if_stale):
    events:  45 s   — frequent; goal/card/sub events change during the match
    stats:   90 s   — slightly less frequent
    lineups: 1800 s — essentially static once submitted; rarely changes

Concurrency guard:
    A per-match NX lock (``lock:match:<id>``) prevents two poller processes (or
    two rapid calls in the same process) from refreshing the same match
    simultaneously.  The lock TTL is 30 s, so a crash does not wedge the lock.

Cache keys written:
    active_match:<id>    — TTL 60 s; written by mark_active; read by list_active
    events:<id>          — SnapshotCache snapshot; age checked against 45 s TTL
    stats:<id>           — SnapshotCache snapshot; age checked against 90 s TTL
    lineups:<id>         — SnapshotCache snapshot; age checked against 1800 s TTL
    match_detail:<id>    — assembled MatchDetailDTO-shaped dict; written each refresh
    lock:match:<id>      — NX lock key (raw redis SET NX EX 30)
"""

from __future__ import annotations

import dataclasses
import time
from typing import Callable

from core.cache import SnapshotCache
from core.providers.base import BaseProvider

# Per-resource TTL constants (seconds)
EVENTS_TTL: int = 45
STATS_TTL: int = 90
LINEUPS_TTL: int = 1800

# Active-match key TTL (seconds) — how long a client's "interest" lives
ACTIVE_MATCH_TTL: int = 60

# Per-match refresh lock TTL (seconds)
LOCK_TTL: int = 30


# ---------------------------------------------------------------------------
# Active-match registry
# ---------------------------------------------------------------------------

def mark_active(cache: SnapshotCache, fixture_id: int, ttl: int = ACTIVE_MATCH_TTL) -> None:
    """
    Register client interest in *fixture_id*.

    Writes ``active_match:<fixture_id>`` with *ttl*-second Redis expiry.  Each
    client request should call this; the key auto-expires when no request has
    refreshed it within *ttl* seconds, removing the match from the poll loop.
    """
    key = f"active_match:{fixture_id}"
    cache.redis.set(key, "1", ex=ttl)


def list_active(cache: SnapshotCache) -> list[int]:
    """
    Return fixture ids that currently have a live ``active_match:*`` key.

    Uses Redis SCAN to enumerate keys matching the pattern; expired keys have
    already been evicted by Redis TTL so they do not appear.

    Returns
    -------
    list[int] — fixture ids (order is non-deterministic).
    """
    ids: list[int] = []
    cursor = 0
    while True:
        cursor, keys = cache.redis.scan(cursor=cursor, match="active_match:*", count=100)
        for raw_key in keys:
            key_str = raw_key.decode() if isinstance(raw_key, bytes) else raw_key
            suffix = key_str.split(":", 1)[1]
            ids.append(int(suffix))
        if cursor == 0:
            break
    return ids


# ---------------------------------------------------------------------------
# Per-match detail refresh
# ---------------------------------------------------------------------------

def refresh_detail_if_stale(
    provider: BaseProvider,
    cache: SnapshotCache,
    fixture_id: int,
    now_fn: Callable[[], float] = time.time,
) -> dict:
    """
    Refresh ``match_detail:<fixture_id>`` in cache, but only fetch each
    provider endpoint when its per-resource TTL has elapsed.

    Parameters
    ----------
    provider:
        Data source; only the endpoints whose TTL has expired are called.
    cache:
        SnapshotCache; used both for TTL-staleness checks and for writing the
        assembled detail.
    fixture_id:
        The fixture to refresh.
    now_fn:
        Injectable clock (default: time.time).  Passed to cache staleness checks
        so tests can advance time deterministically.

    Returns
    -------
    dict — the assembled detail payload (same value written to cache).

    Notes
    -----
    A per-match NX lock (``lock:match:<id>``) serialises concurrent calls.  If
    the lock is already held (another process is refreshing this match), this
    call reads and returns whatever is currently in cache.
    """
    lock_key = f"lock:match:{fixture_id}"
    acquired = cache.redis.set(lock_key, "1", nx=True, ex=LOCK_TTL)

    if not acquired:
        # Another process holds the lock; return cached value without fetching.
        existing = cache.get_snapshot(f"match_detail:{fixture_id}")
        if existing is not None:
            return existing["payload"]
        # Nothing in cache yet; return a minimal placeholder.
        return {"fixture_id": fixture_id, "events": [], "stats": None, "lineups": None}

    try:
        # ----------------------------------------------------------------
        # Build a SnapshotCache with the injectable clock for staleness
        # checks.  We construct a thin wrapper that shares the same redis
        # client but uses our now_fn so is_stale() comparisons are correct
        # when the caller overrides time in tests.
        # ----------------------------------------------------------------
        timed_cache = SnapshotCache(cache.redis, now_fn=now_fn)

        events_key = f"events:{fixture_id}"
        stats_key = f"stats:{fixture_id}"
        lineups_key = f"lineups:{fixture_id}"

        # --- events ---
        if timed_cache.is_stale(events_key, EVENTS_TTL):
            raw_events = provider.get_events(fixture_id)
            events_payload = [dataclasses.asdict(e) for e in raw_events]
            timed_cache.set_snapshot(events_key, events_payload)
        else:
            snap = timed_cache.get_snapshot(events_key)
            events_payload = snap["payload"] if snap else []

        # --- stats ---
        if timed_cache.is_stale(stats_key, STATS_TTL):
            raw_stats = provider.get_stats(fixture_id)
            stats_payload = dataclasses.asdict(raw_stats) if raw_stats is not None else None
            timed_cache.set_snapshot(stats_key, stats_payload)
        else:
            snap = timed_cache.get_snapshot(stats_key)
            stats_payload = snap["payload"] if snap else None

        # --- lineups ---
        if timed_cache.is_stale(lineups_key, LINEUPS_TTL):
            lineups_payload = provider.get_lineups(fixture_id)
            timed_cache.set_snapshot(lineups_key, lineups_payload)
        else:
            snap = timed_cache.get_snapshot(lineups_key)
            lineups_payload = snap["payload"] if snap else None

        # --- assemble and write the combined detail ---
        detail = {
            "fixture_id": fixture_id,
            "events": events_payload,
            "stats": stats_payload,
            "lineups": lineups_payload,
        }
        timed_cache.set_snapshot(f"match_detail:{fixture_id}", detail)
        return detail

    finally:
        # Always release the lock so the next caller isn't blocked.
        cache.redis.delete(lock_key)


# ---------------------------------------------------------------------------
# Batch refresh for all active matches (called by the poller each cycle)
# ---------------------------------------------------------------------------

def refresh_active_matches(provider: BaseProvider, cache: SnapshotCache) -> None:
    """
    Refresh detail for every currently-active match.

    Calls ``list_active`` to enumerate fixture ids with live
    ``active_match:*`` keys, then calls ``refresh_detail_if_stale`` for each.
    Intended to be called by the poller's run_loop after each poll_once cycle.
    """
    for fixture_id in list_active(cache):
        refresh_detail_if_stale(provider, cache, fixture_id)
