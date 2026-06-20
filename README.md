# ⚽ LiveFooty — Live Football Scores & Real-Time Match Center

A mobile-responsive web app for live football: browse fixtures by competition, watch scores update automatically, and open a match to follow a real-time **"match center"** — goal/card/substitution timeline, lineups, key stats, and a cinematic **attack-momentum** visualization built from live API event data.

Built with a **single backend poller → cache → polling clients** architecture so the data cost stays flat whether one user or ten thousand are watching.

> **About "streaming":** real broadcast video requires licensing. The live visual feed here is a **real-time match visualization built from sports-data-API events** (scores, goals, cards, momentum) — not rebroadcast video.
<img width="1834" height="953" alt="image" src="https://github.com/user-attachments/assets/dacd1612-7c68-4bf3-a8d0-7977eb5bc846" />

<img width="1834" height="953" alt="image" src="https://github.com/user-attachments/assets/02e3b7bd-cbba-4a8e-bcc9-be6882dfdccb" />

<img width="1834" height="953" alt="image" src="https://github.com/user-attachments/assets/c8d59a7c-a30a-48d0-b05b-b50af5501031" />

---

## ✨ Features

- **Live scores, auto-updating** — no manual refresh; clients poll a warm cache.
- **Competitions navigation** — a sidebar (desktop) / chip rail (mobile) with major competitions featured first (World Cup, Champions League, top-5 leagues), then everything else playing today.
- **Fixtures browser** with date / competition / team filters, grouped by league with live matches surfaced on top.
- **Real-time match center** (tabbed): event timeline (goals, cards, subs), lineups, and key stats.
- **Attack-momentum "pressure wave"** — a cinematic SVG visualization with goal/card markers on the curve, honestly captioned `based on live stats` or `based on match events` depending on what the API provides for that match.
- **"Broadcast Night" UI** — dark, frosted-glass design system, team crests & league flags, per-match team-color tinting, score-pulse, breathing live indicators, skeleton loaders, and a fully responsive layout.
- **Honesty UX** — every live surface shows "updated Ns ago" and degrades gracefully (stale / reconnecting / no-data) rather than lying.

---

## 🏗️ Architecture

```
                 ┌─────────────────────────────────────────────┐
   API-Football  │  POLLER (one process)                       │
   (or Mock) ───▶│   • polls live scores + fixtures (timer)    │
                 │   • refreshes detail ONLY for matches that  │
                 │     a client has open (active_match keys),  │
                 │     TTL-gated per endpoint                  │
                 └───────────────┬─────────────────────────────┘
                                 │ writes snapshots
                                 ▼
                          ┌────────────┐
                          │   REDIS    │  (cache + poller leader-lock
                          │   cache    │   + active-match registry)
                          └─────┬──────┘
                                │ reads only
                                ▼
              ┌──────────────────────────────┐        ┌──────────────┐
              │  Django + DRF REST endpoints  │◀──────▶│ React (Vite) │
              │  /api/live /api/fixtures      │  poll  │  polling     │
              │  /api/match/<id>              │  ~20s  │  clients     │
              └──────────────────────────────┘        └──────────────┘
```

**Why this shape:**

- **The request path never calls the upstream API.** Endpoints read only from Redis. The poller is the *only* process that talks to API-Football → upstream cost scales with the number of *live matches*, not the number of *users*.
- **Per-match detail is poller-owned.** Opening a match writes an `active_match:<id>` key; the poller refreshes that match's events/stats/lineups (TTL-gated: events 45s, stats 90s, lineups 30m). So **N clients viewing the same match = one fetch loop**, not N.
- **Single-poller invariant** is enforced by a Redis leader-lock, so an accidental second poller can't double the API spend.
- **REST polling, not WebSockets/SSE** — for a ~15–30s "live" cadence against a warm cache, polling is simpler, has no long-lived-connection worker-exhaustion footgun, and deploys on plain sync workers. Identical feel for football scores.

### A note on latency

Apps like FlashScore/SofaScore feel instant because they run on **licensed millisecond push feeds + in-stadium observers + regional CDNs**. On a standard data API the honest pattern is one poller → cache → push at ~15–30s, which looks the same to someone following scores. This app targets that, deliberately and transparently.

---

## 🧰 Tech Stack

| Layer | Tech |
|---|---|
| Backend | Python 3.13, Django 5.2, Django REST Framework |
| Cache / coordination | Redis (snapshot cache, leader-lock, active-match registry) |
| Data provider | API-Football (api-sports.io) — with a Mock provider for offline dev |
| Frontend | React 19, Vite 8 (plain JS), hand-rolled SVG momentum chart |
| Tests | pytest (backend), Vitest + Testing Library (frontend) |
| Deploy | Docker Compose (web + single poller worker + redis + nginx-served SPA) |

---

## 🚀 Quick Start

### Option A — Docker (whole stack, one command)

```bash
cp .env.example .env        # then edit .env (see "Live data" below)
docker compose up --build
```
Open **http://localhost:8080**. Runs four services: Redis, the Django API (gunicorn), one poller worker, and the SPA behind nginx (which reverse-proxies `/api`).

Defaults to the **mock provider**, so it works fully offline with realistic sample data.

### Option B — Native dev (hot reload)

Three terminals from the repo root:

```bash
# 1) Redis
docker run -d --name footy-redis -p 6379:6379 redis:7-alpine

# 2) Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_cache          # warm the cache from the provider
python manage.py runserver 8000
#   (optional 4th terminal: python manage.py run_poller  ← continuous refresh)

# 3) Frontend
cd frontend
npm install
npm run dev                          # http://localhost:5173 (proxies /api → :8000)
```

---

## 🔌 Live data (API-Football)

The app ships on a **mock provider** so you can run it with zero setup. To use real live data:

1. Get a free key at **https://dashboard.api-football.com** (the *direct* api-sports.io version — this app authenticates with the `x-apisports-key` header).
2. In `.env`:
   ```ini
   PROVIDER=api_football
   API_FOOTBALL_KEY=your_key_here
   POLL_INTERVAL=60
   ```
3. `docker compose up --build` (or set the same env vars before `run_poller` in native dev).

> **Free tier = 100 requests/day** — enough to validate, not to run continuously (a 20s poll exhausts it in ~15 min). For sustained use, API-Football's **Pro plan ($19/mo, 7,500/day)** is the realistic floor — and thanks to the architecture, that cost is flat regardless of user count.

---

## 📂 Project Structure

```
backend/
  core/
    providers/        # BaseProvider, MockProvider, ApiFootballProvider, fixture corpus
    normalize.py      # raw API JSON → internal DTOs
    cache.py          # Redis snapshot cache (timestamps + staleness)
    poller.py         # poll loop, leader-lock, run_poller command
    match_detail.py   # active-match registry + TTL-gated detail refresh
    momentum.py       # attack-momentum computation (+ event-density fallback)
    views.py          # cache-backed REST endpoints
  tests/              # pytest
frontend/
  src/
    api/              # usePoll hook, REST helpers
    components/       # FixturesBrowser, LiveScoreList, MatchCenter, MomentumStrip,
                      # CompetitionsNav, TeamCrest, StaleBadge, Skeleton, ...
    theme.css         # "Broadcast Night" design tokens + motion
docker-compose.yml    # redis + backend-web + poller + frontend
DEPLOY.md             # deploy notes + the one-poller invariant
docs/                 # implementation plan
```

---

## ✅ Testing

```bash
# Backend (from backend/, venv active)
python -m pytest tests/ -q

# Frontend (from frontend/)
npx vitest run
npm run build
```

The pure logic — normalization, cache/staleness, the leader-lock, TTL gating, momentum math, the momentum-wave geometry, competition ordering — is unit-tested. Long-running loops and browser polling are smoke-tested rather than unit-tested.

---

## ⚖️ Honest scope & limitations

- **~15–30s "live", not sub-second** — by design (see latency note). True millisecond push needs licensed feeds.
- **Momentum is an aggregate approximation.** API-Football's statistics endpoint returns match totals, not a per-minute time series, and often omits "Attacks/Dangerous Attacks" entirely — so momentum is derived from the best available stat (shots/possession) and falls back to event-density, always captioned honestly. It is *not* a true per-minute pressure model.
- **Stats/lineups depth varies by competition** — top matches return rich data; lower tiers may return only scores and events.
- **Mock logos are placeholders** (they 404) — real crests/flags appear on live data; the UI shows clean initials/hidden fallbacks otherwise.

---

## 📜 License

MIT — see [LICENSE](LICENSE) if present, otherwise free to use and adapt.
