# Task 2.1 Report: Poller loop + Redis leader lock

## Status
COMPLETE — 14/14 tests pass.

## Files Created / Modified

| Path | Action |
|------|--------|
| `backend/core/poller.py` | Created — poll_once, acquire_leadership, renew_leadership, run_loop |
| `backend/core/management/__init__.py` | Created (empty, required by Django) |
| `backend/core/management/commands/__init__.py` | Created (empty, required by Django) |
| `backend/core/management/commands/run_poller.py` | Created — management command |
| `backend/tests/test_poller.py` | Created — 14 tests, TDD-first |
| `backend/footy/settings.py` | Modified — added POLL_INTERVAL setting |

## Pytest Output (exact)

```
============================= test session starts ==============================
platform linux -- Python 3.13.13, pytest-8.x, pluggy-1.6.0
django: version: 5.2.15, settings: footy.settings (from ini)
rootdir: /home/kavumah/Desktop/football-live/backend
configfile: pytest.ini
plugins: django-4.12.0
collecting ... collected 14 items

tests/test_poller.py::TestPollOnce::test_writes_live_scores_snapshot PASSED [  7%]
tests/test_poller.py::TestPollOnce::test_returns_list_written PASSED     [ 14%]
tests/test_poller.py::TestPollOnce::test_snapshot_payload_items_are_dicts_with_expected_keys PASSED [ 21%]
tests/test_poller.py::TestPollOnce::test_does_not_sleep_or_loop PASSED   [ 28%]
tests/test_poller.py::TestAcquireLeadership::test_first_caller_acquires PASSED [ 35%]
tests/test_poller.py::TestAcquireLeadership::test_second_caller_blocked PASSED [ 42%]
tests/test_poller.py::TestAcquireLeadership::test_same_token_returns_false_when_key_exists PASSED [ 50%]
tests/test_poller.py::TestAcquireLeadership::test_auto_token_generated_when_none PASSED [ 57%]
tests/test_poller.py::TestRenewLeadership::test_holder_can_renew PASSED  [ 64%]
tests/test_poller.py::TestRenewLeadership::test_non_holder_cannot_renew PASSED [ 71%]
tests/test_poller.py::TestRenewLeadership::test_renew_on_missing_key_returns_false PASSED [ 78%]
tests/test_poller.py::TestRunLoop::test_two_cycles_without_hanging PASSED [ 85%]
tests/test_poller.py::TestRunLoop::test_one_cycle PASSED                 [ 92%]
tests/test_poller.py::TestRunLoop::test_sleep_called_with_interval PASSED [100%]

============================== 14 passed in 0.12s ==============================
```

## Interface Signatures

```python
# core/poller.py

def poll_once(provider: BaseProvider, cache: SnapshotCache) -> list[dict]:
    ...

def acquire_leadership(
    redis_client,
    lease_ttl: int = 30,
    key: str = "poller:leader",
    token: str | None = None,
) -> bool:
    ...

def renew_leadership(
    redis_client,
    token: str,
    lease_ttl: int = 30,
    key: str = "poller:leader",
) -> bool:
    ...

def run_loop(
    provider: BaseProvider,
    cache: SnapshotCache,
    redis_client,
    token: str,
    interval: int = 20,
    max_cycles: int | None = None,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> None:
    ...
```

## Leader Lock Design

### acquire_leadership
Uses Redis `SET key token NX EX lease_ttl` — fully atomic. Only the first
caller wins; all others get `None` back (mapped to `False`). The TTL means
the lock auto-releases if the holder crashes, bounded by `lease_ttl` seconds.
Token is a per-process `uuid4().hex` so we can distinguish holders.

### renew_leadership
Implements a GET-then-SET pattern:
1. `GET key` → decode bytes to str
2. Compare to our token
3. If match: `SET key token EX lease_ttl` (reset expiry) → return True
4. If mismatch or key missing → return False

**Known race (documented in code):** Between the GET and the SET, the key
could expire and a competing process could acquire it. Our subsequent SET
would then silently overwrite their lease, causing both pollers to believe
they are leader for one cycle. For the MVP (single host, no scaled-out
deployment), this is acceptable. A Lua CAS script (`EVAL "if redis.call('GET',
KEYS[1]) == ARGV[1] then return redis.call('SET', KEYS[1], ARGV[1], 'EX',
ARGV[2]) end"`) would eliminate the race entirely.

### run_loop flow
1. `acquire_leadership` on entry — returns immediately if another holder exists.
2. Each cycle: `poll_once` → `sleep(interval)` → increment cycle counter.
3. If `max_cycles` reached, break.
4. Between cycles: `renew_leadership` — exit loop if we lose leadership.

## Self-Review

- `poll_once` uses `dataclasses.asdict` as required; downstream `json.dumps`
  in SnapshotCache will not encounter dataclass objects.
- Management command defers all imports until `handle()` to avoid import-time
  side-effects; uses `getattr(settings, "POLL_INTERVAL", 20)` as fallback.
- `POLL_INTERVAL` added to `settings.py` as `int(os.environ.get(..., "20"))`.
- The infinite loop body (`run_loop` with `max_cycles=None`) is NOT tested
  per project constraint; only `poll_once`, `acquire_leadership`,
  `renew_leadership`, and bounded `run_loop` are exercised.
- fakeredis (v2.36.2) is already installed; no new dependencies added.

## Concerns

- **run_loop exits silently if not leader on startup.** The management command
  will simply return without error. This is intentional for the single-host
  MVP but could be surprising in a multi-process deployment where the operator
  expects one process to remain running. A log line or a retry-with-backoff
  would be the next improvement.
- **renew_leadership GET-then-SET race** (documented above) — acceptable for
  MVP, needs Lua CAS before horizontal scaling.
- Management command cannot run locally without Redis. Tested with fakeredis
  only; integration against a real Redis is deferred to deploy-time CI.

---

## Fix pass (reviewer fixes, post-commit 7834ab0)

### Fix 1 — run_loop renewal-invariant restructure (backend/core/poller.py)

Restructured the `run_loop` body so leadership is checked at the **top** of
each iteration before poll and sleep, making the renewal invariant
impossible to accidentally bypass.  Concrete changes:

- `acquire_leadership` return value is now checked and the function returns
  `False` early if not leader (was an implicit `return None`).
- Loop body order is now: (1) renew on cycle > 0, (2) poll_once, (3) sleep,
  (4) advance counter + max_cycles check.
- Added a block comment above the loop explaining the renew-each-cycle
  invariant and why renewal must stay above poll_once.
- `run_loop` now returns `True` (was leader, ran normally) or `False` (was
  not leader, exited immediately).  No public signature change — callers that
  discarded `None` still work.

### Fix 2 — test rename (backend/tests/test_poller.py)

Renamed `test_does_not_sleep_or_loop` → `test_poll_once_overwrites_snapshot`
to accurately describe what the test asserts (snapshot updated_at advances on
second call).  The misleading "does not sleep" claim was removed; the body is
unchanged.

### Fix 3 — non-leader exit log (backend/core/management/commands/run_poller.py)

`run_loop`'s new boolean return value is captured in `was_leader`.  When
`False` (i.e. another poller holds the lock), the command now emits:

```
[run_poller] Not leader — another poller holds the lock. Exiting.
```

This resolves the silent exit identified in the prior Concerns section.

### Pytest output — test_poller.py

```
..............                                                           [100%]
14 passed in 0.13s
```

### Pytest output — neighbors (test_cache.py + test_mock_provider.py)

```
..........................                                               [100%]
26 passed in 0.13s
```
