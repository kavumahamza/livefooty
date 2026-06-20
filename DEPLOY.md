# Deploying Football Live

## Quick start (local, mock data)

```bash
cp .env.example .env
docker compose up --build
```

Open **http://localhost:8080** in your browser.

The first poll completes within `POLL_INTERVAL` seconds (default 20 s).
To warm the cache instantly without waiting:

```bash
docker compose exec poller python manage.py seed_cache
```

---

## Switching to live data

1. Set `PROVIDER=api_football` and `API_FOOTBALL_KEY=<your key>` in `.env`.
2. Restart the stack:

```bash
docker compose up -d
```

The poller will start fetching from api-football.com on the next cycle.

---

## The one-poller invariant

**The `poller` service must always run as exactly ONE process.**

Reason: api-football free tier charges per API call; two pollers = double
the spend and can cause rate-limit bans.  The leader-lock inside
`run_poller` is a software backstop, but the primary guard is keeping
the deploy at `replicas: 1`.

```
# Safe — web is stateless, scale freely
docker compose up --scale backend-web=4

# NEVER do this — breaks API budget
docker compose up --scale poller=2   # ← DO NOT DO THIS
```

---

## Services

| Service       | Role                                         | Exposed        |
|---------------|----------------------------------------------|----------------|
| `redis`       | Cache store (live scores, fixtures, etc.)    | internal only  |
| `backend-web` | Gunicorn WSGI, serves `/api/*`               | internal only  |
| `poller`      | One worker: `python manage.py run_poller`    | internal only  |
| `frontend`    | nginx: SPA + `/api/` reverse-proxy           | `localhost:8080` |

---

## Hosting on Render / Fly / Railway

These four services map directly:

- **Redis** → managed Redis add-on (set `REDIS_URL` from the add-on's connection string)
- **backend-web** → Web Service (start command: `gunicorn footy.wsgi:application --bind 0.0.0.0:$PORT --workers 3`)
- **poller** → Background Worker (start command: `python manage.py run_poller`; set replicas = 1)
- **frontend** → Static Site (build: `npm ci && npm run build`; publish dir: `dist`) — or serve behind the backend with a path rewrite

Set all env vars from `.env.example` in the hosting dashboard.  Never commit `.env` to git.
