# Task 3.1 Report — Cache-backed REST Endpoints

## Status

COMPLETE. All tests pass (105 total, 17 new REST tests, 0 regressions).

---

## Files Created / Modified

| File | Action |
|------|--------|
| `backend/core/views.py` | Created — all three endpoint views |
| `backend/core/urls.py` | Created — URL patterns for core app |
| `backend/footy/urls.py` | Modified — include core.urls under `/api/` |
| `backend/core/poller.py` | Modified — added `poll_fixtures_once`; called in `run_loop` |
| `backend/core/management/commands/seed_cache.py` | Created — idempotent dev/seed command |
| `backend/tests/test_rest.py` | Created — 17 TDD tests for all three endpoints |

---

## Endpoint Contract / Response Shapes

### GET /api/fixtures?date=&league=&team=
```json
{
  "updated_at": 1750450000.0,     // epoch float, null if cold cache
  "age_seconds": 3.2,             // float, null if cold cache
  "fixtures": [
    {
      "id": 100,
      "league": "Premier League",
      "league_id": 39,
      "home": "Arsenal",
      "away": "Chelsea",
      "home_score": 1,
      "away_score": 0,
      "status": "1H",
      "minute": 32,
      "kickoff_utc": "2026-06-20T15:00:00Z"
    }
  ]
}
```
- Cold cache (no "fixtures" snapshot): `fixtures: [], age_seconds: null` — never 500.
- `league`: if numeric → filters by `league_id`; otherwise `league` name contains (case-insensitive).
- `team`: home or away name contains (case-insensitive).
- `date`: matches `kickoff_utc` date prefix (e.g. "2026-06-20").

### GET /api/live
```json
{
  "updated_at": 1750450000.0,
  "age_seconds": 3.2,
  "fixtures": [ ...same shape as above... ]
}
```
- Cold cache: `fixtures: [], age_seconds: null`.

### GET /api/match/<int:fixture_id>
```json
{
  "fixture_id": 100,
  "fixture": {          // null if not found in either live_scores or fixtures snapshot
    "id": 100,
    "home": "Arsenal",
    "away": "Chelsea",
    "home_score": 1,
    "away_score": 0,
    "status": "1H",
    "minute": 32,
    "kickoff_utc": "2026-06-20T15:00:00Z"
  },
  "detail": {
    "fixture_id": 100,
    "events": [ {"minute": 32, "type": "goal", "team": "Arsenal", ...} ],
    "stats": { "attacks_home": 60, "attacks_away": 40, ... },
    "lineups": null
  },
  "momentum": {
    "mode": "stats",          // or "events"
    "buckets": [              // always 18 entries
      {"minute": 5, "value": 0.12},
      ...
      {"minute": 90, "value": -0.05}
    ],
    "caption": "based on live stats"
  },
  "updated_at": 1750450000.0,
  "age_seconds": 3.2
}
```
- Cold detail (poller not yet populated): `detail = {events:[], stats:null, lineups:null}`, `age_seconds: null` — always 200.
- `mark_active` is called BEFORE any cache read.

---

## Cache Injection in Tests

The `patch_get_cache` fixture (autouse=True) uses `monkeypatch.setattr` to replace `core.views.get_cache` with a lambda returning a `SnapshotCache` built on `fakeredis.FakeRedis()`. This keeps tests hermetic — no real Redis, no Django settings tweaks needed.

```python
@pytest.fixture(autouse=True)
def patch_get_cache(monkeypatch, cache):
    import core.views as views_mod
    monkeypatch.setattr(views_mod, "get_cache", lambda: cache)
```

---

## How home/away Names Are Sourced for Momentum

`MatchDetailView` calls `_find_fixture_in_snapshots(cache, fixture_id)` which searches the `live_scores` snapshot first, then `fixtures`. The `"home"` and `"away"` fields from the matched fixture dict are passed directly to `compute_momentum(detail, home_team=..., away_team=...)`. These are the same strings stored by the poller via `dataclasses.asdict(FixtureDTO)`, so they match the `team` field on events emitted by the provider.

---

## seed_cache Management Command

```bash
# From backend/ directory:
python manage.py seed_cache
```

Writes both snapshots using get_provider() (defaults to MockProvider):
1. Fetches `provider.get_fixtures(today)` → writes "fixtures" snapshot.
2. Fetches `provider.get_live_scores()` → writes "live_scores" snapshot.
3. Calls `mark_active(cache, id)` for each live fixture.
4. Calls `refresh_active_matches(provider, cache)` once.

Idempotent — safe to call multiple times.

---

## Poller Now Also Writes "fixtures"

`poll_fixtures_once(provider, cache)` added to `core/poller.py`. It is called inside `run_loop` each cycle immediately after `poll_once`. This means in production the "fixtures" snapshot is refreshed alongside live scores every 20 s.

**Existing 14 poller tests: still all pass.** The new call in `run_loop` adds a `get_fixtures` invocation each cycle but the tests only assert on live_scores presence and sleep/cycle counts — nothing broke.

---

## Full pytest Output

```
........................................................................ [ 68%]
.................................                                        [100%]
105 passed in 0.42s
```

---

## Self-Review / Concerns

1. **No DRF**: views use plain Django `View` + `JsonResponse`. This is intentional — DRF is in requirements but not required here since there's no auth, no serializers, and JSON output is trivial. Can be migrated to APIView later.
2. **Filtering is linear scan**: O(n) Python filter over the snapshot list. For an MVP with a few hundred fixtures per day this is fine; a production system would index in Redis or a DB.
3. **poll_fixtures_once location in run_loop**: it's placed BETWEEN `poll_once` and `refresh_active_matches`. If `get_fixtures` throws (e.g. API outage), it would skip `refresh_active_matches`. A production poller would want try/except around each step. *(Fixed in Fix pass below.)*
4. **`_cache_instance` singleton in `cache.py`**: in tests we monkeypatch `get_cache` at the view module level, so the singleton is never populated during tests. This is by design.

---

## Fix pass

**Reviewer concern (commit c8a623a):** `run_loop` called the three per-cycle data steps in sequence with no exception isolation. A transient provider/API error on any earlier step would skip the later steps for that cycle; an unhandled exception could also break out of the loop entirely.

### What changed

**`backend/core/poller.py`**

- Added `import logging` and `logger = logging.getLogger(__name__)` at module level.
- Wrapped each of the three data-fetch calls in its own `try/except Exception`:
  - `poll_once(provider, cache)` — catches and logs, continues.
  - `poll_fixtures_once(provider, cache)` — catches and logs, continues.
  - `refresh_active_matches(provider, cache)` — catches and logs, continues.
- On exception each block logs `logger.warning("<step> failed: %s", exc)` and falls through to the next step.
- Leadership renewal, loop control (`max_cycles`, `sleep_fn`), and return value are **unchanged** — only the three data-step calls are isolated.

**`backend/tests/test_poller.py`**

Added `test_fixtures_step_failure_does_not_skip_refresh_active_matches` to `TestRunLoop`:

- Constructs a stub provider whose `get_live_scores()` returns a valid `_FakeDTO` (so `poll_once` succeeds and writes `live_scores`), and whose `get_fixtures()` raises `RuntimeError` (simulating a transient API outage).
- Monkeypatches `core.poller.refresh_active_matches` with a spy counter.
- Runs `run_loop(max_cycles=1, sleep_fn=no-op)`.
- Asserts:
  1. `run_loop` returns `True` (completed normally as leader).
  2. `live_scores` snapshot was written by `poll_once` (middle failure didn't roll back earlier work).
  3. The spy counter shows `refresh_active_matches` was invoked once (middle failure didn't block the third step).

### pytest outputs

**`tests/test_poller.py` only (15 tests):**

```
...............                                                          [100%]
15 passed in 0.14s
```

**Full suite `tests/` (106 tests):**

```
........................................................................  [ 67%]
..................................                                        [100%]
106 passed in 0.42s
```
