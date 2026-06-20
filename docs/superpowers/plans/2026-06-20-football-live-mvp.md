# Football Live — MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mobile-responsive web app showing live football fixtures, auto-updating live scores, and a real-time match center (event timeline of goals/cards/subs, lineups, key stats, and a momentum/event-density visual), deliverable as a working MVP in 2–3 days.

**Architecture:** A single backend **poller** fetches the cheap global live-scores feed on a timer and writes snapshots to a Redis-backed cache; per-match detail (events/stats/lineups) is fetched **on demand only for matches a client currently has open**, each with its own TTL. Clients receive one-way updates over **Server-Sent Events (SSE)** — no WebSocket/Channels. A **provider abstraction** lets us build and demo entirely against recorded real-API fixtures (incl. sparse/null/halftime states) and flip to the live API-Football provider with one env var.

**Tech Stack:** Django + Django REST Framework (SSE via `StreamingHttpResponse`), Redis (cache + poller leader lock), React + Vite (responsive), API-Football (api-sports.io) as the live provider.

## Global Constraints

- **Deadline:** Core MVP must be demoable in 2–3 days. Cut order if behind: (1) momentum bar → fall back to event-density strip, (2) live stats/lineups panels → cached/optional, never block the live-score loop.
- **API budget:** Live launch = API-Football **Pro $19/mo** (7,500 req/day, 300 req/min). NEVER poll events/stats/lineups for all live matches. Global live-scores poll only; per-match detail on demand for OPEN matches, with TTLs: events 30–60s, stats 60–120s, lineups once (15–60 min TTL).
- **Dev does not touch quota:** All development and demo runs against `MockProvider` replaying recorded JSON. Real API hit only for a short, deliberate validation window.
- **Transport:** SSE only. One-way server→client. No Django Channels, no WebSocket.
- **Cache is authoritative for clients:** Filters (date/league/team) run against cached data. Clients NEVER trigger a direct API-Football call.
- **Honesty UX:** Every live surface shows "updated Xs ago"; stale/poller-down/abandoned states render explicitly, never as fresh.
- **RAM note (dev workstation):** Do not run whole-repo test/lint matrices locally. Run targeted pytest files and the single React build only.

---

## File Structure

**Backend (`backend/`)**
- `manage.py`, `footy/settings.py`, `footy/urls.py`, `footy/asgi.py` — Django project
- `core/providers/base.py` — `BaseProvider` interface (the contract every provider implements)
- `core/providers/mock.py` — `MockProvider` replays `core/providers/fixtures/*.json`
- `core/providers/api_football.py` — `ApiFootballProvider` (auth, retry, rate-limit, normalization)
- `core/providers/fixtures/` — recorded real responses incl. sparse/null/halftime/abandoned
- `core/normalize.py` — map raw API shapes → our internal DTOs (one place to absorb API quirks)
- `core/cache.py` — Redis snapshot store: `set_snapshot/get_snapshot` with timestamps + staleness
- `core/poller.py` — poll loop + Redis leader lock; `python manage.py run_poller`
- `core/match_detail.py` — on-demand TTL'd fetch of events/stats/lineups for open matches
- `core/momentum.py` — compute momentum/event-density buckets from stats-or-events
- `core/views.py` — REST: `/api/fixtures`, `/api/match/<id>`; SSE: `/api/stream/scores`, `/api/stream/match/<id>`
- `core/serializers.py` / DTOs — internal shapes shared across views
- `tests/` — pytest, one file per module

**Frontend (`frontend/`, Vite + React)**
- `src/api/sse.js` — `useSSE(url)` hook: EventSource + auto-reconnect + last-event timestamp
- `src/api/rest.js` — fetch helpers for fixtures/match snapshot
- `src/components/FixturesBrowser.jsx` — date/league/team filters over cached fixtures
- `src/components/LiveScoreList.jsx` — SSE-subscribed auto-updating score list
- `src/components/MatchCenter.jsx` — timeline + lineups + stats + momentum strip
- `src/components/MomentumStrip.jsx` — momentum bar with event-density fallback
- `src/components/StaleBadge.jsx` — "updated Xs ago" / poller-down indicator
- `src/App.jsx`, `src/main.jsx`, responsive CSS

---

## Internal DTO contract (used by every task — copy verbatim)

```python
# core/providers/base.py
from dataclasses import dataclass, field

@dataclass
class FixtureDTO:
    id: int
    league: str
    league_id: int
    home: str
    away: str
    home_score: int | None
    away_score: int | None
    status: str          # "NS","1H","HT","2H","FT","ABD","PST", etc.
    minute: int | None
    kickoff_utc: str     # ISO8601

@dataclass
class EventDTO:
    minute: int
    type: str            # "goal","card","subst"
    detail: str          # "Yellow Card","Normal Goal","Substitution 1"
    team: str
    player: str | None
    assist: str | None

@dataclass
class StatsDTO:
    # any field may be None — coverage varies by league/match
    possession_home: int | None = None
    possession_away: int | None = None
    shots_home: int | None = None
    shots_away: int | None = None
    attacks_home: int | None = None
    attacks_away: int | None = None
    dangerous_home: int | None = None
    dangerous_away: int | None = None

@dataclass
class MatchDetailDTO:
    fixture: FixtureDTO
    events: list = field(default_factory=list)   # list[EventDTO]
    stats: "StatsDTO | None" = None
    lineups: dict | None = None                  # {"home":[...], "away":[...]} or None
```

```python
# BaseProvider — the contract
class BaseProvider:
    def get_fixtures(self, date: str) -> list[FixtureDTO]: ...
    def get_live_scores(self) -> list[FixtureDTO]: ...          # CHEAP global feed
    def get_events(self, fixture_id: int) -> list[EventDTO]: ...
    def get_stats(self, fixture_id: int) -> "StatsDTO | None": ...
    def get_lineups(self, fixture_id: int) -> dict | None: ...
```

---

## Phase 0 — Scaffold & provider contract (Day 1 AM)

### Task 0.1: Backend skeleton + deps
**Files:** Create `backend/requirements.txt`, `backend/footy/settings.py`, `backend/manage.py` (via `django-admin startproject`).
- [ ] Create venv, install `django djangorestframework redis django-cors-headers pytest pytest-django requests`.
- [ ] `django-admin startproject footy backend` then `python manage.py startapp core`.
- [ ] Add `core`, `rest_framework`, `corsheaders` to `INSTALLED_APPS`; configure CORS for the Vite dev origin; add `PROVIDER` env switch (`mock`|`api_football`), `API_FOOTBALL_KEY`, `REDIS_URL` to settings.
- [ ] Commit: `chore: django skeleton + deps`.

### Task 0.2: Provider interface + DTOs
**Files:** Create `core/providers/base.py` (DTOs + `BaseProvider` above), `core/providers/__init__.py` with `get_provider()` factory reading `settings.PROVIDER`.
- [ ] Write `tests/test_provider_factory.py`: `get_provider()` returns `MockProvider` when `PROVIDER=mock`.
- [ ] Run → FAIL.
- [ ] Implement factory.
- [ ] Run → PASS. Commit: `feat: provider contract + factory`.

### Task 0.3: Record real fixtures (the honest mock data)
**Files:** Create `core/providers/fixtures/{fixtures_today.json, live_scores.json, events_<id>.json, stats_<id>.json, stats_sparse_<id>.json, lineups_<id>.json, match_abandoned.json}`.
- [ ] During the deliberate API validation window (or from API-Football docs sample payloads), save **raw** responses for: a date's fixtures, a live-scores snapshot, one match with rich events+stats+lineups, and one match with **null/sparse stats** and one **abandoned/HT** state.
- [ ] Commit: `test: recorded real API fixtures incl. sparse/null/abandoned`.

> **Why this task is load-bearing:** clean hand-written mocks hide exactly the missing-field/late-event/null-stat failures that break delivery. These recordings ARE the test corpus for normalization and the momentum fallback.

---

## Phase 1 — Mock provider, normalization, cache (Day 1 PM)

### Task 1.1: MockProvider replays recordings
**Files:** Create `core/providers/mock.py`, `core/normalize.py`, `tests/test_mock_provider.py`.
**Interfaces:** Produces `MockProvider` implementing every `BaseProvider` method by loading the JSON in `fixtures/` and passing through `normalize.py`.
- [ ] Test: `get_live_scores()` returns `list[FixtureDTO]` with correct scores/status parsed from `live_scores.json`.
- [ ] Test: `get_stats(sparse_id)` returns a `StatsDTO` whose `shots_home is None` (sparse case does not crash).
- [ ] Run → FAIL. Implement `normalize_fixture/normalize_events/normalize_stats` + `MockProvider`. Run → PASS.
- [ ] Commit: `feat: mock provider + normalization with sparse-safe parsing`.

### Task 1.2: Redis snapshot cache
**Files:** Create `core/cache.py`, `tests/test_cache.py`.
**Interfaces:** Produces `set_snapshot(key, payload)`, `get_snapshot(key) -> {payload, updated_at, age_seconds}`, `is_stale(key, max_age) -> bool`. Use `fakeredis` in tests.
- [ ] Test: snapshot round-trips and reports `age_seconds`; `is_stale` true past threshold.
- [ ] Run → FAIL. Implement (store JSON + ISO timestamp). Run → PASS.
- [ ] Commit: `feat: redis snapshot cache with staleness`.

---

## Phase 2 — Poller + on-demand detail (Day 2 AM)

### Task 2.1: Poller loop + leader lock
**Files:** Create `core/poller.py`, `core/management/commands/run_poller.py`, `tests/test_poller.py`.
**Interfaces:** Produces `poll_once(provider, cache)` (one cycle: `get_live_scores()` → `set_snapshot("live_scores", ...)`) and `acquire_leadership(redis)` (SETNX lease w/ TTL so only one poller writes).
- [ ] Test: `poll_once` with `MockProvider` writes a `live_scores` snapshot; second concurrent `acquire_leadership` returns False.
- [ ] Run → FAIL. Implement loop (`while leader: poll_once; sleep(POLL_INTERVAL=20)`) + lease renew. Run → PASS.
- [ ] Commit: `feat: single-poller loop with redis leader lock`.

> **Mitigation baked in:** leader lock prevents a scaled-out second poller from doubling quota; in-memory cache is banned (breaks across workers). On crash, clients keep last snapshot + staleness; cold start serves stale-but-labeled then refreshes.

### Task 2.2: On-demand match detail with TTLs
**Files:** Create `core/match_detail.py`, `tests/test_match_detail.py`.
**Interfaces:** Produces `get_match_detail(provider, cache, fixture_id) -> MatchDetailDTO`, reading cache first and only calling provider when the per-endpoint TTL (events 45s, stats 90s, lineups 1800s) has expired.
- [ ] Test: two calls within TTL hit the provider exactly once (assert call count via a spy provider).
- [ ] Run → FAIL. Implement per-endpoint TTL gating. Run → PASS.
- [ ] Commit: `feat: TTL-gated on-demand match detail (protects API budget)`.

### Task 2.3: Momentum / event-density computation
**Files:** Create `core/momentum.py`, `tests/test_momentum.py`.
**Interfaces:** Produces `compute_momentum(detail: MatchDetailDTO) -> {"mode": "stats"|"events", "buckets": list[float]}`. If stats expose shots/attacks → derive pressure buckets; else fall back to event-density (goals/cards over time buckets).
- [ ] Test: rich-stats detail → `mode=="stats"`; sparse detail → `mode=="events"` and never raises.
- [ ] Run → FAIL. Implement with graceful fallback. Run → PASS.
- [ ] Commit: `feat: momentum with deterministic event-density fallback`.

---

## Phase 3 — REST + SSE endpoints (Day 2 PM)

### Task 3.1: REST fixtures + match snapshot (cache-backed)
**Files:** Modify `core/views.py`, `core/urls.py`; create `tests/test_rest.py`.
**Interfaces:** `GET /api/fixtures?date=&league=&team=` filters the cached fixtures snapshot; `GET /api/match/<id>` returns `get_match_detail(...)` + momentum. No direct provider call from the request path except the TTL-gated detail fetch.
- [ ] Test: `/api/fixtures?league=39` returns only that league from cache; unknown filter → empty list not 500.
- [ ] Run → FAIL. Implement views (read cache, filter in Python). Run → PASS.
- [ ] Commit: `feat: cache-backed fixtures + match REST endpoints`.

### Task 3.2: SSE streams
**Files:** Modify `core/views.py`, `core/urls.py`; create `tests/test_sse.py`.
**Interfaces:** `GET /api/stream/scores` yields `data: <live_scores snapshot>\n\n` every `POLL_INTERVAL`; `GET /api/stream/match/<id>` yields match-detail+momentum on each tick. Use `StreamingHttpResponse` with `text/event-stream`, a heartbeat comment every 15s, and `Cache-Control: no-cache`.
- [ ] Test: response `Content-Type == text/event-stream`; first chunk parses as the cached snapshot JSON.
- [ ] Run → FAIL. Implement generator (read cache each tick — does NOT call the API directly). Run → PASS.
- [ ] Commit: `feat: SSE score + match-center streams`.

---

## Phase 4 — Frontend (Day 2 PM → Day 3)

### Task 4.1: Vite app + SSE hook
**Files:** Create `frontend/` (`npm create vite@latest frontend -- --template react`), `src/api/sse.js`, `src/api/rest.js`.
**Interfaces:** `useSSE(url)` returns `{data, lastEventAt, connected}`, auto-reconnects with backoff on `error`, parses `event.data` JSON.
- [ ] Implement EventSource hook with reconnect + `lastEventAt`. Manual check: connects to `/api/stream/scores`, logs ticks.
- [ ] Commit: `feat: vite react app + reconnecting SSE hook`.

### Task 4.2: Fixtures browser + filters
**Files:** Create `src/components/FixturesBrowser.jsx`.
- [ ] Date/league/team controls; fetch `/api/fixtures` and filter via query params (server filters cache). Responsive list/grid.
- [ ] Commit: `feat: fixtures browser with date/league/team filters`.

### Task 4.3: Live score list (SSE)
**Files:** Create `src/components/LiveScoreList.jsx`, `src/components/StaleBadge.jsx`.
- [ ] Subscribe via `useSSE('/api/stream/scores')`; auto-update scores/minute; `StaleBadge` shows "updated Xs ago" and a "reconnecting…" state when `!connected`.
- [ ] Commit: `feat: auto-updating live score list with staleness UX`.

### Task 4.4: Match center + momentum strip
**Files:** Create `src/components/MatchCenter.jsx`, `src/components/MomentumStrip.jsx`.
- [ ] Subscribe `useSSE('/api/stream/match/<id>')`; render event timeline (goals/cards/subs), lineups panel (hide gracefully if `null`), key stats (hide null fields), and `MomentumStrip` rendering `mode==="stats"` bar or `mode==="events"` density fallback.
- [ ] Commit: `feat: real-time match center with momentum/event-density visual`.

### Task 4.5: Responsive QA + App shell
**Files:** Modify `src/App.jsx`, CSS.
- [ ] Routing (list ↔ match), mobile breakpoints, touch targets. Manual check at 360px / 768px / 1280px.
- [ ] Commit: `feat: responsive shell + navigation`.

---

## Phase 5 — Live validation + deploy (Day 3)

### Task 5.1: Deliberate live-API validation window
- [ ] Set `PROVIDER=api_football` + key; run poller for ONE short window during real live matches. Confirm: live-scores feed shape, events present, **which leagues actually return rich stats** (decides whether momentum bar ships as "stats" mode or stays "events"). Record findings; re-save any newly-discovered payload shapes into `fixtures/`.
- [ ] Commit: `test: live-api validation findings + updated recordings`.

### Task 5.2: Deploy (WebSocket-free is the point)
**Files:** Create `Dockerfile`(s), `render.yaml`/`fly.toml` or chosen host config, `frontend` static build.
- [ ] Host with Redis add-on (Render/Fly/Railway). Backend: gunicorn/uvicorn serving DRF + SSE (SSE needs response buffering OFF / proxy `X-Accel-Buffering: no`). Run poller as a separate worker process (one instance). Frontend: static build behind CDN. Set CORS, secrets, `REDIS_URL`.
- [ ] Smoke test deployed SSE stream. Commit: `chore: deploy config (SSE + redis + worker)`.

> **Deploy gotchas (decide Day 0, not Day 3):** SSE over a proxy needs buffering disabled or events queue up; the poller must run as exactly one worker (not per-web-replica); secrets via env not committed.

---

## Self-Review

- **Spec coverage:** fixtures browser+filters (4.2), auto live scores (2.1/3.2/4.3), match center timeline+lineups+stats (2.2/3.1/4.4), momentum visual w/ fallback (2.3/4.4), real-time (SSE 3.2/4.1), mobile-responsive (4.5), mock-first build (0.3/1.1), $19 budget protection (2.2 TTLs + leader lock 2.1). ✓
- **Codex mitigations baked in:** separate events/stats/lineups endpoints + TTLs (2.2), momentum demoted with deterministic fallback (2.3), Redis cache + leader lock + staleness UX (1.2/2.1/4.3), recorded-not-clean fixtures (0.3), SSE over Channels (3.2), deploy buffering/one-poller (5.2), free tier is build-only + deliberate validation window (5.1). ✓
- **Cut order if behind:** momentum bar → event-density (already the fallback); then stats/lineups panels become optional cached; live scores + fixtures + timeline are the non-negotiable core.
