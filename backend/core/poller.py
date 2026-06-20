"""
core/poller.py — single-cycle poll + Redis leader lock for the live-score poller.

Design notes
------------
Leader lock (acquire_leadership):
    Uses Redis SET key token NX EX ttl — atomic SETNX-with-expiry.  Only the
    first caller that wins the race gets True; all subsequent callers get False
    until the key expires.  Token is a per-process UUID so we can distinguish
    holders.

Leader renewal (renew_leadership):
    GET key → compare to our token → if match, re-SET with a fresh EX.  This is
    a GET-then-SET (not a Lua CAS), so there is a tiny race: between the GET and
    the SET another process could acquire the expired key and our re-SET would
    silently overwrite it.  For an MVP poller this is acceptable — the worst
    outcome is both pollers write for one cycle before the non-holder's next
    acquire attempt fails.  A Lua CAS script would eliminate the race entirely.

poll_once:
    Calls provider.get_live_scores(), converts each FixtureDTO to a plain dict
    via dataclasses.asdict (required because SnapshotCache passes the value to
    json.dumps), and stores the list under key "live_scores".  Returns the list.
    Must NOT sleep or loop — callers control iteration.

run_loop:
    Finite/infinite control loop.  max_cycles and sleep_fn are injectable so
    tests can run exactly N cycles without real sleeping.  The management command
    passes max_cycles=None (infinite) and sleep_fn=time.sleep.
"""

from __future__ import annotations

import dataclasses
import time
import uuid
from typing import Callable

from core.cache import SnapshotCache
from core.match_detail import refresh_active_matches
from core.providers.base import BaseProvider


# ---------------------------------------------------------------------------
# Single poll cycle
# ---------------------------------------------------------------------------

def poll_once(provider: BaseProvider, cache: SnapshotCache) -> list[dict]:
    """
    Perform one poll cycle.

    Calls provider.get_live_scores(), serialises the FixtureDTOs to plain dicts,
    stores them under cache key "live_scores", and returns the list written.
    Does NOT sleep or loop.
    """
    dtos = provider.get_live_scores()
    payload = [dataclasses.asdict(dto) for dto in dtos]
    cache.set_snapshot("live_scores", payload)
    return payload


def poll_fixtures_once(provider: BaseProvider, cache: SnapshotCache) -> list[dict]:
    """
    Fetch today's fixture list and write it to the "fixtures" snapshot.

    Separated from poll_once so that:
    - The live-scores poll (fast, every cycle) and fixture-list poll (slower) can
      evolve independently.
    - Existing poll_once tests are not affected.

    Called by run_loop each cycle alongside poll_once so the /api/fixtures
    endpoint always has fresh data in production.
    Does NOT sleep or loop.
    """
    import datetime as _dt
    today = _dt.date.today().isoformat()
    dtos = provider.get_fixtures(today)
    payload = [dataclasses.asdict(dto) for dto in dtos]
    cache.set_snapshot("fixtures", payload)
    return payload


# ---------------------------------------------------------------------------
# Leader lock helpers
# ---------------------------------------------------------------------------

def acquire_leadership(
    redis_client,
    lease_ttl: int = 30,
    key: str = "poller:leader",
    token: str | None = None,
) -> bool:
    """
    Attempt to acquire the leader lease.

    Uses atomic SET key token NX EX lease_ttl.  Returns True if this caller
    acquired the lock, False if another holder already holds it.

    Parameters
    ----------
    redis_client:
        Any redis-compatible client.
    lease_ttl:
        Key TTL in seconds; on crash the key auto-expires so another process
        can take over.
    key:
        Redis key used for the lock.
    token:
        Unique identifier for this caller.  If None, a uuid4 hex string is
        generated.  Pass explicitly in tests for determinism.
    """
    if token is None:
        token = uuid.uuid4().hex
    result = redis_client.set(key, token, nx=True, ex=lease_ttl)
    # redis-py returns True on success, None on NX-fail
    return result is True


def renew_leadership(
    redis_client,
    token: str,
    lease_ttl: int = 30,
    key: str = "poller:leader",
) -> bool:
    """
    Refresh the leader lease only if we still hold it.

    GET key — if the stored value equals our token, re-SET with a fresh expiry
    and return True.  If the key is missing or held by another token, return False.

    NOTE: There is a tiny GET-then-SET race: if the key expires between the GET
    and the SET, a competing process could win the key in that window and our
    subsequent SET would silently overwrite their lease.  For the MVP (single
    host, single poller) this is acceptable; a Lua CAS script would eliminate
    the race.
    """
    current = redis_client.get(key)
    if current is None:
        return False
    # fakeredis and redis-py both return bytes; decode for comparison
    if isinstance(current, bytes):
        current = current.decode()
    if current != token:
        return False
    redis_client.set(key, token, ex=lease_ttl)
    return True


# ---------------------------------------------------------------------------
# Control loop
# ---------------------------------------------------------------------------

def run_loop(
    provider: BaseProvider,
    cache: SnapshotCache,
    redis_client,
    token: str,
    interval: int = 20,
    max_cycles: int | None = None,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> None:
    """
    Main poller loop: while leader, poll once then sleep(interval).

    Parameters
    ----------
    provider:
        Data source; get_live_scores() is called each cycle.
    cache:
        SnapshotCache where results are written.
    redis_client:
        Redis client used for leader-lock operations.
    token:
        This process's unique leader-lock token.
    interval:
        Seconds to sleep between cycles.
    max_cycles:
        If None, loop forever (production mode).
        If set to an integer N, exit after exactly N cycles (test mode).
    sleep_fn:
        Injectable sleep callable — pass ``lambda s: None`` in tests.
    """
    # Acquire leadership on first entry; bail immediately if another holder exists.
    if not acquire_leadership(redis_client, token=token):
        return False  # signal: not leader

    # Per-cycle invariant: leadership is checked (acquired on cycle 0, renewed on
    # every subsequent cycle) at the TOP of each iteration, BEFORE poll_once and
    # BEFORE sleep.  This ordering is intentional: it ensures a future edit cannot
    # accidentally place poll_once or sleep_fn BEFORE the leadership gate, silently
    # polling without holding the lock.  Do not move the renewal below poll_once.
    cycle = 0
    while True:
        # 1. Renew lease at the start of every cycle after the first.
        #    (Cycle 0 is already covered by acquire_leadership above.)
        if cycle > 0 and not renew_leadership(redis_client, token=token):
            break  # Lost leadership; stop polling.

        # 2. Poll exactly once while confirmed leader.
        poll_once(provider, cache)

        # 2c. Also refresh the fixtures list each cycle so /api/fixtures stays fresh.
        poll_fixtures_once(provider, cache)

        # 2b. Refresh detail for any actively-viewed matches (Task 2.2).
        #     This is intentionally a separate step from poll_once so that
        #     poll_once remains responsible solely for live-score aggregation
        #     and is easy to test in isolation.
        refresh_active_matches(provider, cache)

        # 3. Sleep until the next cycle.
        sleep_fn(interval)

        # 4. Advance counter and check finite-mode bound.
        cycle += 1
        if max_cycles is not None and cycle >= max_cycles:
            break

    return True  # signal: was leader, completed normally
