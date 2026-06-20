# Task 2.2 Report — Poller-owned match detail via active-match registry

## Status
COMPLETE — all tests pass, code committed on `build/mvp`.

---

## Files Changed

| File | Change |
|------|--------|
| `backend/core/cache.py` | Added `redis` property to `SnapshotCache` to expose underlying redis client for raw operations (SCAN, SET NX, etc.) |
| `backend/core/match_detail.py` | **New file** — full implementation of `mark_active`, `list_active`, `refresh_detail_if_stale`, `refresh_active_matches` |
| `backend/core/poller.py` | Wired `refresh_active_matches` into `run_loop` as step 2b after `poll_once` |
| `backend/tests/test_match_detail.py` | **New file** — 13 tests covering all four public interfaces |

---

## Exact pytest Output

### tests/test_match_detail.py
```
.............                                                            [100%]
13 passed in 0.14s
```

### tests/test_poller.py
```
..............                                                           [100%]
14 passed in 0.12s
```

---

## Per-Resource TTL Design

Three endpoint-specific TTL constants in `match_detail.py`:

```python
EVENTS_TTL:  int = 45    # seconds — frequent changes (goals, cards, subs)
STATS_TTL:   int = 90    # seconds — somewhat less frequent
LINEUPS_TTL: int = 1800  # seconds — essentially static once submitted
```

These are independent: each resource has its own cache key (`events:<id>`, `stats:<id>`, `lineups:<id>`) whose staleness is evaluated separately. Only the stale endpoints are re-fetched from the provider; fresh ones are served from cache.

---

## How Freshness is Tracked

`SnapshotCache.set_snapshot(key, payload)` writes a JSON envelope:
```json
{"payload": <data>, "updated_at": <epoch float>}
```

`SnapshotCache.is_stale(key, max_age)` reads that envelope, computes `now - updated_at`, and returns `True` if the age exceeds `max_age` (or the key is absent). Equality is treated as NOT stale.

`refresh_detail_if_stale` constructs a `SnapshotCache` using the caller-supplied `now_fn` (instead of the global cache's clock) so that test code can advance time deterministically without touching `time.time`.

---

## How the Spy Proves One-Fetch-Per-TTL

`SpyProvider` is a `BaseProvider` subclass that increments counters per fixture_id on each endpoint call:
```python
self.events_calls[fixture_id] += 1   # incremented in get_events()
self.stats_calls[fixture_id]  += 1   # incremented in get_stats()
self.lineups_calls[fixture_id] += 1  # incremented in get_lineups()
```

Test flow for the core invariant:
1. Call 1 at `t=0` → all three counters reach 1 (initial population).
2. Call 2 at same `t=0` → `is_stale` returns False for all; provider not called; all counters remain 1.
3. Advance `t` to `EVENTS_TTL + 5 = 50 s`.
4. Call 3 at `t=50` → events TTL (45 s) exceeded → `events_calls` increments to 2.  Stats TTL (90 s) and lineups TTL (1800 s) not yet exceeded → their counters remain 1.

Assertions directly check these call counts, proving per-resource TTL independence.

---

## How Wired into run_loop

`core/poller.py` imports `refresh_active_matches` from `core.match_detail` and calls it as step 2b in the cycle body, after `poll_once` and before `sleep_fn`:

```python
# 2. Poll exactly once while confirmed leader.
poll_once(provider, cache)

# 2b. Refresh detail for any actively-viewed matches (Task 2.2).
refresh_active_matches(provider, cache)

# 3. Sleep until the next cycle.
sleep_fn(interval)
```

`poll_once` itself is unchanged. Existing poller tests all still pass (14/14).

---

## Self-Review

**Correct:**
- `mark_active` uses `cache.redis.set(key, "1", ex=ttl)` — raw Redis call, correct TTL semantics.
- `list_active` uses cursor-based SCAN to handle large key sets without KEYS blocking.
- `refresh_detail_if_stale` uses NX lock (`lock:match:<id>`, 30 s TTL) to serialise concurrent refreshes. Lock is always released in a `finally` block to avoid deadlocks.
- Per-resource cache keys (`events:<id>`, etc.) are independent of `match_detail:<id>`, so individual endpoint freshness can be tracked separately.
- `SnapshotCache.redis` property is minimal (one line) and doesn't break the abstraction — raw redis is only used by `match_detail.py` for operations that have no SnapshotCache equivalent (SCAN, SET NX EX).

**Known Limitations / Concerns:**

1. **SCAN consistency**: `list_active` uses cursor-based SCAN which is safe but non-atomic. In a high-key-churn scenario a key could expire between the SCAN cursor returning its page and the caller acting on it. The effect is benign: `refresh_detail_if_stale` for an expired active key still works (the match just gets one extra refresh cycle before the active key stops being re-written by clients).

2. **Lock contention on slow provider**: The NX lock TTL is 30 s. If a provider call takes longer than 30 s the lock auto-expires and a second process could start a concurrent refresh. For the MVP (single host, single poller) this is acceptable.

3. **stats_payload=None written to cache**: If `provider.get_stats()` returns `None`, the stats snapshot is written as `null` in Redis. `is_stale` would return True on the next call since the snapshot exists but `payload` is None — the code re-fetches and writes None again. This is correct behaviour (avoids an infinite "stale" loop) because the `updated_at` timestamp is still written and the age check works normally.

4. **test_poller.py run_loop tests**: The existing tests use `MockProvider` which now also triggers `refresh_active_matches` inside `run_loop`. Since no `active_match:*` keys exist in the test's fakeredis, `list_active` returns `[]` and `refresh_active_matches` is a no-op — all 14 existing tests still pass.
