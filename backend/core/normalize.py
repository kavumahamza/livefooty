"""Normalize raw API-Football v3 JSON responses → provider DTOs (Task 1.1)."""
from __future__ import annotations

from core.providers.base import EventDTO, FixtureDTO, StatsDTO

# ---------------------------------------------------------------------------
# Fixture normalization
# ---------------------------------------------------------------------------

def normalize_fixture(raw: dict) -> FixtureDTO:
    """Map a single API-Football fixture object → FixtureDTO."""
    fix = raw["fixture"]
    league = raw["league"]
    teams = raw["teams"]
    goals = raw.get("goals", {}) or {}

    return FixtureDTO(
        id=fix["id"],
        league=league["name"],
        league_id=league["id"],
        home=teams["home"]["name"],
        away=teams["away"]["name"],
        home_score=goals.get("home"),       # may be null → None
        away_score=goals.get("away"),
        status=fix["status"]["short"],      # "1H","HT","FT","NS","ABD", …
        minute=fix["status"].get("elapsed"),  # may be null → None
        kickoff_utc=fix["date"],
        home_logo=raw.get("teams", {}).get("home", {}).get("logo"),
        away_logo=raw.get("teams", {}).get("away", {}).get("logo"),
        league_logo=raw.get("league", {}).get("logo"),
        league_flag=raw.get("league", {}).get("flag"),
    )


def normalize_fixtures(response: list[dict]) -> list[FixtureDTO]:
    """Normalize the 'response' array from a fixtures endpoint."""
    return [normalize_fixture(r) for r in response]


# ---------------------------------------------------------------------------
# Events normalization
# ---------------------------------------------------------------------------

_TYPE_MAP = {
    "goal": "goal",
    "card": "card",
    "subst": "subst",
}


def normalize_event(raw: dict) -> EventDTO | None:
    """Map a single event object → EventDTO, or None if it should be skipped (Var)."""
    raw_type = (raw.get("type") or "").lower()
    mapped = _TYPE_MAP.get(raw_type)
    if mapped is None:
        # Skip "var" and any unknown types
        return None

    player_obj = raw.get("player") or {}
    assist_obj = raw.get("assist") or {}

    return EventDTO(
        minute=raw["time"]["elapsed"],
        type=mapped,
        detail=raw.get("detail") or "",
        team=(raw.get("team") or {}).get("name") or "",
        player=player_obj.get("name"),   # None if absent or null
        assist=assist_obj.get("name"),   # None if absent or null
    )


def normalize_events(response: list[dict]) -> list[EventDTO]:
    """Normalize the 'response' array from a fixtures/events endpoint."""
    result = []
    for raw in response:
        evt = normalize_event(raw)
        if evt is not None:
            result.append(evt)
    return result


# ---------------------------------------------------------------------------
# Stats normalization
# ---------------------------------------------------------------------------

def _parse_possession(value) -> int | None:
    """Convert "55%" → 55; None/missing → None."""
    if value is None:
        return None
    s = str(value).strip().rstrip("%")
    try:
        return int(s)
    except (ValueError, TypeError):
        return None


def normalize_stats(response: list[dict]) -> StatsDTO:
    """
    Normalize the 'response' array from fixtures/statistics.
    response[0] = home team stats, response[1] = away team stats.
    Absent stat types → None (sparse-safe).
    """
    def build_map(team_stats: dict) -> dict:
        return {entry["type"]: entry.get("value") for entry in team_stats.get("statistics", [])}

    home_map = build_map(response[0]) if len(response) > 0 else {}
    away_map = build_map(response[1]) if len(response) > 1 else {}

    return StatsDTO(
        possession_home=_parse_possession(home_map.get("Ball Possession")),
        possession_away=_parse_possession(away_map.get("Ball Possession")),
        shots_home=home_map.get("Total Shots"),
        shots_away=away_map.get("Total Shots"),
        attacks_home=home_map.get("Attacks"),         # None if key absent
        attacks_away=away_map.get("Attacks"),
        dangerous_home=home_map.get("Dangerous Attacks"),
        dangerous_away=away_map.get("Dangerous Attacks"),
    )


# ---------------------------------------------------------------------------
# Lineups normalization
# ---------------------------------------------------------------------------

def normalize_lineups(response: list[dict]) -> dict | None:
    """Return {"home": [names...], "away": [names...]} or None."""
    if not response or len(response) < 2:
        return None

    def extract_names(team_data: dict) -> list[str]:
        return [
            entry["player"]["name"]
            for entry in team_data.get("startXI", [])
            if entry.get("player") and entry["player"].get("name")
        ]

    return {
        "home": extract_names(response[0]),
        "away": extract_names(response[1]),
    }
