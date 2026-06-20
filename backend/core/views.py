"""
core/views.py — Cache-backed REST endpoints for the football live-score frontend.

Design constraints (Task 3.1):
- NO provider or API calls in ANY request path.
- Endpoints ONLY read from SnapshotCache (and call mark_active for match detail).
- Cold cache (absent key) always returns 200 with empty payload and null age_seconds.
- All filtering is performed in Python after reading the snapshot.
"""
from __future__ import annotations

import time

from django.http import JsonResponse
from django.views import View

from core.cache import get_cache
from core.match_detail import mark_active
from core.momentum import compute_momentum


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _snapshot_response_meta(snapshot) -> dict:
    """
    Extract updated_at / age_seconds from a snapshot dict (may be None for cold cache).

    Returns {"updated_at": float|None, "age_seconds": float|None}.
    """
    if snapshot is None:
        return {"updated_at": None, "age_seconds": None}
    return {
        "updated_at": snapshot["updated_at"],
        "age_seconds": snapshot["age_seconds"],
    }


def _find_fixture_in_snapshots(cache, fixture_id: int) -> dict | None:
    """
    Search both the live_scores and fixtures snapshots for a fixture with the given id.
    Returns the first matching fixture dict, or None.
    """
    for key in ("live_scores", "fixtures"):
        snap = cache.get_snapshot(key)
        if snap is None:
            continue
        for f in snap["payload"]:
            if f.get("id") == fixture_id:
                return f
    return None


# ---------------------------------------------------------------------------
# GET /api/fixtures
# ---------------------------------------------------------------------------

class FixturesView(View):
    """
    Return the cached "fixtures" snapshot, filtered by optional query params:
      - league: matches league_id (if numeric) OR league name contains (case-insensitive)
      - team:   home or away name contains (case-insensitive)
      - date:   kickoff_utc date prefix match (e.g. "2026-06-20")

    Cold cache → 200 with fixtures:[] and age_seconds:null.
    Unknown filter → 200 with empty list (never 500).
    """

    def get(self, request):
        cache = get_cache()
        snap = cache.get_snapshot("fixtures")
        meta = _snapshot_response_meta(snap)

        if snap is None:
            return JsonResponse({"fixtures": [], **meta})

        fixtures: list[dict] = snap["payload"]

        # --- Apply filters ---
        league_param = request.GET.get("league", "").strip()
        team_param = request.GET.get("team", "").strip()
        date_param = request.GET.get("date", "").strip()

        if league_param:
            # Try numeric match on league_id first, then name contains
            if league_param.isdigit():
                league_id_filter = int(league_param)
                fixtures = [f for f in fixtures if f.get("league_id") == league_id_filter]
            else:
                lc = league_param.lower()
                fixtures = [
                    f for f in fixtures
                    if lc in (f.get("league") or "").lower()
                ]

        if team_param:
            tc = team_param.lower()
            fixtures = [
                f for f in fixtures
                if tc in (f.get("home") or "").lower()
                or tc in (f.get("away") or "").lower()
            ]

        if date_param:
            fixtures = [
                f for f in fixtures
                if (f.get("kickoff_utc") or "").startswith(date_param)
            ]

        return JsonResponse({"fixtures": fixtures, **meta})


# ---------------------------------------------------------------------------
# GET /api/live
# ---------------------------------------------------------------------------

class LiveView(View):
    """
    Return the cached "live_scores" snapshot.

    Cold cache → 200 with fixtures:[] and age_seconds:null.
    Clients poll this every ~20 s.
    """

    def get(self, request):
        cache = get_cache()
        snap = cache.get_snapshot("live_scores")
        meta = _snapshot_response_meta(snap)

        fixtures = snap["payload"] if snap is not None else []
        return JsonResponse({"fixtures": fixtures, **meta})


# ---------------------------------------------------------------------------
# GET /api/match/<fixture_id>
# ---------------------------------------------------------------------------

class MatchDetailView(View):
    """
    Return cached match detail for a specific fixture.

    Steps:
    1. mark_active(cache, fixture_id) — tells the poller to keep refreshing this match.
    2. Read match_detail:<id> from cache.
    3. Look up the fixture summary (home/away names, score, status) from live_scores
       or fixtures snapshot.
    4. Compute momentum using the fixture's home/away names so event directions are correct.
    5. Return assembled JSON.

    Cold detail (poller hasn't populated yet) → empty shell, momentum from empty events,
    age_seconds null.  Always 200 — frontend will poll again.
    """

    def get(self, request, fixture_id: int):
        cache = get_cache()

        # Step 1: register client interest (poller will start/keep refreshing)
        mark_active(cache, fixture_id)

        # Step 2: read cached detail
        detail_snap = cache.get_snapshot(f"match_detail:{fixture_id}")
        meta = _snapshot_response_meta(detail_snap)

        if detail_snap is not None:
            detail = detail_snap["payload"]
        else:
            # Empty shell so downstream consumers always get the expected shape
            detail = {"fixture_id": fixture_id, "events": [], "stats": None, "lineups": None}

        # Step 3: look up the fixture summary from live_scores or fixtures
        fixture_summary = _find_fixture_in_snapshots(cache, fixture_id)

        # Step 4: compute momentum — pass home/away names from the fixture so
        # event team strings can be resolved to a side (positive = home).
        home_team = fixture_summary.get("home") if fixture_summary else None
        away_team = fixture_summary.get("away") if fixture_summary else None
        momentum = compute_momentum(detail, home_team=home_team, away_team=away_team)

        return JsonResponse({
            "fixture_id": fixture_id,
            "fixture": fixture_summary,
            "detail": detail,
            "momentum": momentum,
            **meta,
        })
