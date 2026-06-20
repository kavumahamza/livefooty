# Football Live — MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mobile-responsive web app showing live football fixtures, auto-updating live scores, and a real-time match center (event timeline of goals/cards/subs, lineups, key stats, and a momentum/event-density visual), deliverable as a working MVP in 2–3 days.

**Architecture:** A single backend **poller** fetches the cheap global live-scores feed on a timer and writes snapshots to a Redis-backed cache. When a client opens a match, the frontend marks it active (`active_match:<id>` key, 60s TTL); the **poller** — not the request path — refreshes that match's detail (events/stats/lineups) under a per-match lock, each endpoint TTL-gated. **Clients only ever read cache, via plain REST polling** (~20s scores, ~45–90s match) — no SSE, no WebSocket, no long-lived connections, so any plain sync worker serves it. A **provider abstraction** lets us build and demo entirely against committed sample/recorded fixtures (incl. sparse/null/halftime states) and flip to the live API-Football provider with one env var.

**Tech Stack:** Django + Django REST Framework (plain JSON endpoints), Redis (cache + poller leader lock + active-match registry), React + Vite (responsive, polling via a Vite dev proxy for same-origin), API-Football (api-sports.io) as the live provider.

## Design & UX (benchmark-informed)

Benchmarked against FlashScore, LiveScore, SofaScore. **Direction: hybrid — FlashScore-style dense fixtures list + SofaScore-style rich tabbed match center.** Latency note: the pros hit 0.3–1.2s via licensed push feeds + in-stadium observers + regional CDNs; we cannot and do not match that — our 15–30s polling is the honest target (already reflected in the proposal). The benchmark output is primarily this design spec.

- **Aesthetic:** dark, high-contrast theme; a single **live accent color** (green) for in-play state; mobile-first single column; tabs render as a horizontal strip on narrow screens. Define as CSS custom properties (`--bg`, `--surface`, `--text`, `--muted`, `--live`, `--home`, `--away`) so the whole app is themed from one place.
- **Home / fixtures (FlashScore-dense):** fixtures **grouped under league headers** (league name + country); date selector; **live matches surfaced at the top**. Each row is compact and high-density: `minute-or-kickoff · home · score · away · live-dot`. Live rows use the accent color on the minute. Tapping a row opens the full-page match center.
- **Match center (SofaScore-rich), full page, tabbed:** **Summary · Lineups · Stats**.
  - **Header:** large scoreline — home / `score`–`score` / away, plus status/minute and the staleness badge.
  - **Summary tab:** the **Attack Momentum strip** (hero visual) directly under the header, then the **event timeline** (each entry: minute + type icon for goal/card/subst + player; home events aligned left, away events aligned right of a center spine).
  - **Lineups tab:** home/away starting XI as formation-grouped lists; render "lineups unavailable" if `null`. (Pitch view is phase 2.)
  - **Stats tab:** paired home/away horizontal bars (possession, shots, shots on target, attacks, dangerous attacks); **omit any field that is null** rather than showing 0.
- **Attack Momentum strip — exact visual spec (`MomentumStrip.jsx`):** a **diverging vertical-bar chart along the match-minute x-axis**. Bars rising from the center line = **home** pressure (`--home` color); bars falling below = **away** pressure (`--away` color); bar height = intensity for that minute-bucket. Two render modes from `compute_momentum`: `mode==="stats"` → height from shots/attacks/dangerous-attacks deltas; `mode==="events"` (fallback) → height from event density per bucket. A small "based on live stats" vs "based on match events" caption tells the user which mode is active (honesty UX).

## Global Constraints

- **Deadline:** Core MVP must be demoable in 2–3 days. Cut order if behind: (1) momentum bar → fall back to event-density strip, (2) live stats/lineups panels → cached/optional, never block the live-score loop.
- **API budget:** Live launch = API-Football **Pro $19/mo** (7,500 req/day, 300 req/min). NEVER poll events/stats/lineups for all live matches. Global live-scores poll only; per-match detail on demand for OPEN matches, with TTLs: events 30–60s, stats 60–120s, lineups once (15–60 min TTL).
- **Dev does not touch quota:** All development and demo runs against `MockProvider` replaying recorded JSON. Real API hit only for a short, deliberate validation window.
- **Transport:** REST polling only. Plain JSON endpoints read from Redis. No SSE, no Channels, no WebSocket, no long-lived streaming responses (avoids the sync-worker-exhaustion trap). Client polls on a timer; dev uses a **Vite proxy** so `/api` is same-origin (no EventSource/CORS-credentials headaches).
- **Cache is authoritative for clients:** Filters (date/league/team) run against cached data. Clients NEVER trigger a direct API-Football call. **All provider calls are owned by the poller process** — never the request/response path.
- **Match-detail ownership:** A client opening a match writes `active_match:<id>` (60s TTL). The poller scans active keys each cycle and refreshes that match's detail under a per-match Redis lock. This is the ONLY trigger for per-match fetches — so N open clients cause at most ONE fetch loop per match, not N.
- **Honesty UX:** Every live surface shows "updated Xs ago"; stale/poller-down/abandoned states render explicitly, never as fresh.
- **Testing scope:** Unit-test only pure functions (`poll_once`, `acquire_leadership`, normalization, momentum, one-tick cache reads). Do NOT pytest infinite poll loops or browser polling — smoke-test those manually. Keeps the test budget from eating Day 2.
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
- `src/api/poll.js` — `usePoll(url, intervalMs)` hook: setInterval fetch + `lastUpdatedAt` + error/backoff state
- `src/api/rest.js` — fetch helpers for fixtures/match snapshot; `vite.config.js` proxies `/api` → Django (same-origin)
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

### Task 0.3: Seed fixture corpus from committed sample JSON (no live dependency)
**Files:** Create `core/providers/fixtures/{fixtures_today.json, live_scores.json, events_<id>.json, stats_<id>.json, stats_sparse_<id>.json, lineups_<id>.json, match_abandoned.json}`.
- [ ] Build the corpus from **API-Football's published v3 docs sample payloads** (raw response shapes for fixtures, fixtures?live=all, fixtures/events, fixtures/statistics, fixtures/lineups). Hand-derive the **sparse/null-stats** and **abandoned/HT** variants by nulling fields in a copy — these MUST exist before normalization is written.
- [ ] Commit: `test: seed fixture corpus from API-Football docs samples (+ sparse/abandoned variants)`.

> **Why this task is load-bearing & has NO live dependency:** the corpus is the test substrate for normalization and the momentum fallback, and it must exist on Day 1. Live API recordings are NOT a prerequisite here — they are enrichment captured later in Task 5.1. This breaks the chicken-and-egg between "need recordings Day 1" and "validate live API Day 3." If a docs sample is ambiguous, add a contract test marked `xfail` until live validation confirms the real shape.

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

### Task 2.2: Poller-owned match detail with active-match registry + TTLs
**Files:** Create `core/match_detail.py`, `tests/test_match_detail.py`; extend `core/poller.py`.
**Interfaces:** Produces `mark_active(cache, fixture_id)` (writes `active_match:<id>` w/ 60s TTL), `list_active(cache) -> list[int]`, and `refresh_detail_if_stale(provider, cache, fixture_id)` (per-endpoint TTL gate: events 45s, stats 90s, lineups 1800s; under a per-match Redis lock). The poll loop calls `refresh_detail_if_stale` for each `list_active()` id every cycle and writes `match_detail:<id>` to cache. The REST `/api/match/<id>` view calls `mark_active` then reads `match_detail:<id>` (cache) — it does NOT fetch from the provider itself.
- [ ] Test: `refresh_detail_if_stale` called twice within TTL hits the provider exactly once (spy provider asserts call count).
- [ ] Test: two `active_match` ids both registered → poll cycle refreshes both; an expired active key is skipped.
- [ ] Run → FAIL. Implement registry + TTL gating + per-match lock; wire into the poll loop. Run → PASS.
- [ ] Commit: `feat: poller-owned match detail via active-match registry (one fetch loop per match, not per client)`.

> **Closes the data-flow gap:** provider calls live ONLY in the poller process. Opening a match just registers interest; the single poller does the work. N clients on the same match ⇒ one fetch loop. Clients (REST or any future stream) only ever read `match_detail:<id>`.

### Task 2.3: Momentum / event-density computation
**Files:** Create `core/momentum.py`, `tests/test_momentum.py`.
**Interfaces:** Produces `compute_momentum(detail: MatchDetailDTO) -> {"mode": "stats"|"events", "buckets": list[float]}`. If stats expose shots/attacks → derive pressure buckets; else fall back to event-density (goals/cards over time buckets).
- [ ] Test: rich-stats detail → `mode=="stats"`; sparse detail → `mode=="events"` and never raises.
- [ ] Run → FAIL. Implement with graceful fallback. Run → PASS.
- [ ] Commit: `feat: momentum with deterministic event-density fallback`.

---

## Phase 3 — REST polling endpoints (Day 2 PM)

### Task 3.1: Cache-backed fixtures + live-scores + match endpoints
**Files:** Modify `core/views.py`, `core/urls.py`; create `tests/test_rest.py`.
**Interfaces:**
- `GET /api/fixtures?date=&league=&team=` — filters the cached fixtures snapshot in Python.
- `GET /api/live` — returns the cached `live_scores` snapshot + `age_seconds` (clients poll this ~20s).
- `GET /api/match/<id>` — calls `mark_active(cache, id)` then returns cached `match_detail:<id>` + momentum + `age_seconds` (clients poll this ~45–90s).
- Every response includes `updated_at`/`age_seconds` for the staleness badge. No provider call in any request path.
- [ ] Test: `/api/fixtures?league=39` returns only that league from cache; unknown filter → empty list not 500.
- [ ] Test: `/api/match/<id>` registers `active_match:<id>` and returns the cached detail payload with `age_seconds`.
- [ ] Run → FAIL. Implement views (read cache, filter in Python, mark active). Run → PASS.
- [ ] Commit: `feat: cache-backed fixtures + live + match polling endpoints`.

---

## Phase 4 — Frontend (Day 2 PM → Day 3)

### Task 4.1: Vite app + polling hook + dev proxy
**Files:** Create `frontend/` (`npm create vite@latest frontend -- --template react`), `src/api/poll.js`, `src/api/rest.js`, `vite.config.js`.
**Interfaces:** `usePoll(url, intervalMs)` returns `{data, lastUpdatedAt, error}`; fetches immediately then on `setInterval`, exponential backoff on error, clears on unmount. `vite.config.js` proxies `/api` → `http://localhost:8000` so the frontend is same-origin (no CORS/credentials issues).
- [ ] Implement `usePoll` + proxy. Manual check: polls `/api/live`, updates on interval, stops on unmount.
- [ ] Commit: `feat: vite react app + polling hook + same-origin dev proxy`.

### Task 4.2: Fixtures browser + filters (FlashScore-dense)
**Files:** Create `src/components/FixturesBrowser.jsx`, `src/theme.css` (the `--bg/--surface/--text/--muted/--live/--home/--away` custom properties from the Design section).
- [ ] Date/league/team controls; fetch `/api/fixtures` and filter via query params (server filters cache).
- [ ] **Grouped-by-league layout** with league headers; live matches surfaced at top; compact high-density rows `minute/kickoff · home · score · away · live-dot`; live rows use `--live` accent. Dark theme via `theme.css` tokens. Responsive single column on mobile.
- [ ] Commit: `feat: dense grouped fixtures browser with filters + dark theme tokens`.

### Task 4.3: Live score list (polling)
**Files:** Create `src/components/LiveScoreList.jsx`, `src/components/StaleBadge.jsx`.
- [ ] `usePoll('/api/live', 20000)`; auto-update scores/minute; `StaleBadge` reads `age_seconds` to show "updated Xs ago" and a "stale / reconnecting…" state when `error` or age exceeds threshold.
- [ ] Commit: `feat: auto-updating live score list with staleness UX`.

### Task 4.4: Match center (SofaScore-rich, tabbed) + momentum strip
**Files:** Create `src/components/MatchCenter.jsx`, `src/components/MomentumStrip.jsx`.
- [ ] `usePoll('/api/match/<id>', 45000)`. **Full-page, tabbed: Summary · Lineups · Stats** (tabs as a horizontal strip on mobile). Header = large scoreline + status/minute + `StaleBadge`.
- [ ] **Summary tab:** `MomentumStrip` (hero, directly under header) then event timeline — minute + type icon (goal/card/subst) + player, home events left / away events right of a center spine.
- [ ] **Lineups tab:** home/away XI lists; "lineups unavailable" when `null`. **Stats tab:** paired home/away bars; omit null fields (don't show 0).
- [ ] **`MomentumStrip`:** diverging vertical bars over match-minute x-axis — up=`--home`, down=`--away`, height=intensity; `mode==="stats"` from shots/attacks, `mode==="events"` density fallback; caption states which mode ("based on live stats" / "based on match events").
- [ ] **Cut order if short on time:** event timeline is the non-negotiable core; momentum strip, then stats, then lineups are layered on top and cut from the top down.
- [ ] Commit: `feat: tabbed match center with diverging attack-momentum visual`.

### Task 4.5: Responsive QA + App shell
**Files:** Modify `src/App.jsx`, CSS.
- [ ] Routing (list ↔ match), mobile breakpoints, touch targets. Manual check at 360px / 768px / 1280px.
- [ ] Commit: `feat: responsive shell + navigation`.

---

## Phase 5 — Live validation + deploy (Day 3)

### Task 5.1: Deliberate live-API validation window
- [ ] Set `PROVIDER=api_football` + key; run poller for ONE short window during real live matches. Confirm: live-scores feed shape, events present, **which leagues actually return rich stats** (decides whether momentum bar ships as "stats" mode or stays "events"). Record findings; re-save any newly-discovered payload shapes into `fixtures/`.
- [ ] Commit: `test: live-api validation findings + updated recordings`.

### Task 5.2: Deploy (plain stateless web tier + one poller worker)
**Files:** Create `Dockerfile`(s), `render.yaml`/`fly.toml` or chosen host config, `frontend` static build.
- [ ] Host with Redis add-on (Render/Fly/Railway). Backend = **plain `gunicorn footy.wsgi --workers 3`** (no streaming = no worker-model gymnastics, no async workers needed). Run the poller as a **separate worker process, exactly ONE instance** (`python manage.py run_poller`) — the leader lock is the backstop if the host ever starts two. Frontend: static build behind CDN. Set secrets + `REDIS_URL`. CORS only matters if not same-origin; prefer serving the SPA same-origin or via the CDN with a path rewrite.
- [ ] Smoke test deployed `/api/live` polling. Commit: `chore: deploy config (wsgi web + single poller worker + redis)`.

> **Deploy gotchas (decide Day 0, not Day 3):** the poller must run as exactly ONE process (separate from web replicas — scaling web does NOT scale the poller); secrets via env, never committed. No SSE means no proxy-buffering or async-worker traps.

---

## Self-Review

- **Spec coverage:** fixtures browser+filters (4.2), auto live scores (2.1/3.1/4.3), match center timeline+lineups+stats (2.2/3.1/4.4), momentum visual w/ fallback (2.3/4.4), real-time via polling (3.1/4.1), mobile-responsive (4.5), mock-first build (0.3/1.1), $19 budget protection (2.2 TTLs + leader lock 2.1). ✓
- **Codex round-1 mitigations:** separate events/stats/lineups + TTLs (2.2), momentum demoted w/ deterministic fallback (2.3), Redis cache + leader lock + staleness UX (1.2/2.1/4.3), realistic-not-clean fixture corpus (0.3), free tier build-only + validation window (5.1). ✓
- **Codex round-2 mitigations:** SSE dropped → REST polling, killing the sync-worker-exhaustion trap (Global Constraints, 3.1, 5.2); match-detail ownership moved entirely into the poller via the `active_match` registry so N clients = 1 fetch loop (2.2); corpus seeded from committed docs samples, breaking the live-data chicken-and-egg (0.3); Vite same-origin proxy removes EventSource/CORS-credentials problems (4.1); tests restricted to pure units, no infinite-loop/stream tests (Global Constraints, 2.x). ✓
- **Scope ladder (timeline is the top residual risk — one dev, 2–3 days).** Build in this order and stop wherever the clock runs out; every rung is independently demoable:
  1. **Must-ship core:** fixtures browser + filters, live-score polling list, match page with **event timeline only**, staleness badge, mock provider, one live-validation pass, deploy.
  2. **If time:** lineups panel, key-stats panel (both cached, hide-on-null).
  3. **If more time:** momentum strip in `stats` mode (else it stays `events`-density, which rung 1 already covers).
  - Cut from the top down if behind. Rungs 2–3 are explicitly out of the client's guaranteed 2–3 day commitment and should be framed to them as "bonus if the data cooperates."
