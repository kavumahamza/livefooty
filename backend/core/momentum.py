"""
core/momentum.py — Attack momentum visualization data for the MomentumStrip.

Computes a diverging pressure curve over match minutes:
  - POSITIVE value  → home team pressure (bar rises)
  - NEGATIVE value  → away team pressure (bar falls)
  - Magnitude in [0, 1]; final values clamped to [-1, 1].

Output shape
------------
{
    "mode":    "stats" | "events",
    "buckets": [{"minute": <int>, "value": <float>}, ...],   # 18 entries
    "caption": "based on live stats" | "based on match events"
}

Buckets: 18 fixed 5-minute windows, ending at 5, 10, 15, …, 90.

Mode selection
--------------
Use ``mode="stats"`` ONLY when the detail's stats dict is present AND
``attacks_home`` / ``attacks_away`` are both non-None.  Otherwise fall
back to ``mode="events"``.

Stats-mode computation (MVP approximation)
------------------------------------------
The corpus (and the upstream API in its default form) provides MATCH-AGGREGATE
stats — single totals over the whole match, NOT a per-minute time-series.  A
proper per-minute pressure curve requires the live API's per-minute stats
endpoint, which is outside this MVP scope.

Approximation used here:
  1. Derive an aggregate home-pressure baseline from attacks (and dangerous
     attacks / shots if available):
       home_share = attacks_home / (attacks_home + attacks_away)
       baseline   = 2 * home_share - 1   → in [-1, 1]
     Dangerous attacks and shots are blended in with lower weight if present.
  2. Apply a deterministic shaping across the 18 buckets so the curve is not
     completely flat: a cosine modulation adds mild mid-match variation while
     staying centred on the baseline.
  3. Goal and card events in a bucket nudge that bucket toward the scoring /
     carding team (their impact is bounded so they never flip the direction by
     more than 0.4 in a single bucket).
  4. Result is clamped to [-1, 1].

TODO (post-MVP): replace step 1 with the per-minute stats endpoint
(``/fixtures/statistics?fixture=<id>&type=attacks&minute=...``).

Events-mode computation
-----------------------
Event weights (how much a single event shifts its bucket toward the team):
  goal  → 1.0
  card  → 0.4   (cards signal aggression / disruption)
  subst → 0.2   (substitution = team adjusting, mild signal)
  other → 0.0

Direction:
  event.team == home_team → positive contribution
  event.team == away_team → negative contribution
  team name unknown / not provided → contributes 0 (excluded, not guessed)

Empty buckets → 0.0.  Sparse / zero-event data never raises.

Side-assignment without per-event home/away flags
--------------------------------------------------
Events carry a ``team`` name string but no home/away flag.  We resolve the
direction by comparing ``event["team"]`` to the caller-supplied ``home_team``
and ``away_team`` arguments.  If those are not provided (or a team name does
not match either), we skip side-assignment for that event (contribute 0) rather
than guess.  Task 3.1 passes the team names from the live_scores fixture.
"""
from __future__ import annotations

import math

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

NUM_BUCKETS: int = 18          # 5-min windows: 5, 10, …, 90
BUCKET_SIZE: int = 5           # minutes per bucket

# Event weights in events mode
_EVENT_WEIGHT: dict[str, float] = {
    "goal":  1.0,
    "card":  0.4,
    "subst": 0.2,
}

# Blend weights for stats-mode baseline (must sum to 1.0)
_ATTACKS_WEIGHT:    float = 0.60
_DANGEROUS_WEIGHT:  float = 0.25
_SHOTS_WEIGHT:      float = 0.15

# Cosine shaping amplitude (fraction of baseline; keeps curve non-flat)
_SHAPE_AMPLITUDE: float = 0.20

# Maximum per-bucket nudge from events in stats mode
_EVENT_NUDGE_CAP: float = 0.40


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_momentum(
    detail: dict,
    home_team: str | None = None,
    away_team: str | None = None,
) -> dict:
    """
    Compute the attack momentum from *detail*.

    Parameters
    ----------
    detail:
        match_detail dict with keys:
          fixture_id, events (list of event dicts), stats (dict or None),
          lineups (dict or None).
    home_team:
        Display name of the home team, used to assign direction to events.
        If None, events cannot be assigned a side.
    away_team:
        Display name of the away team.

    Returns
    -------
    dict — see module docstring for shape.
    """
    stats = detail.get("stats")
    events = detail.get("events") or []

    if _has_rich_stats(stats):
        buckets = _compute_stats_mode(stats, events, home_team, away_team)
        mode = "stats"
        caption = "based on live stats"
    else:
        buckets = _compute_events_mode(events, home_team, away_team)
        mode = "events"
        caption = "based on match events"

    return {"mode": mode, "buckets": buckets, "caption": caption}


# ---------------------------------------------------------------------------
# Mode selection
# ---------------------------------------------------------------------------

def _has_rich_stats(stats: dict | None) -> bool:
    """Return True iff stats is present and has non-None attacks_home/away."""
    if stats is None:
        return False
    return (
        stats.get("attacks_home") is not None
        and stats.get("attacks_away") is not None
    )


# ---------------------------------------------------------------------------
# Stats mode
# ---------------------------------------------------------------------------

def _compute_stats_mode(
    stats: dict,
    events: list[dict],
    home_team: str | None,
    away_team: str | None,
) -> list[dict]:
    """
    Derive 18 buckets from aggregate stats + event nudges.

    The aggregate stats give a SINGLE home-vs-away pressure ratio; we shape it
    across buckets with a cosine modulation, then nudge individual buckets for
    goals/cards that occurred in that window.
    """
    baseline = _compute_baseline(stats)

    # Build raw bucket values from cosine shaping around the baseline
    raw = [0.0] * NUM_BUCKETS
    for i in range(NUM_BUCKETS):
        # Cosine shaping: one full wave over the 90 minutes
        phase = 2.0 * math.pi * i / NUM_BUCKETS
        shaping = _SHAPE_AMPLITUDE * math.cos(phase)
        raw[i] = baseline + shaping

    # Apply event nudges
    event_nudges = _collect_event_nudges(events, home_team, away_team)
    for i, nudge in enumerate(event_nudges):
        capped_nudge = max(-_EVENT_NUDGE_CAP, min(_EVENT_NUDGE_CAP, nudge))
        raw[i] += capped_nudge

    # Clamp and format
    return _format_buckets(raw)


def _compute_baseline(stats: dict) -> float:
    """
    Derive a single [-1, 1] home-pressure baseline from aggregate stats.

    Blends attacks (primary), dangerous attacks, and shots with fixed weights.
    Falls back to equal-weight components when some fields are None.
    """
    components: list[float] = []
    weights: list[float] = []

    attacks_h = stats.get("attacks_home")
    attacks_a = stats.get("attacks_away")
    if attacks_h is not None and attacks_a is not None:
        total = attacks_h + attacks_a
        if total > 0:
            components.append(2.0 * attacks_h / total - 1.0)
            weights.append(_ATTACKS_WEIGHT)

    dangerous_h = stats.get("dangerous_home")
    dangerous_a = stats.get("dangerous_away")
    if dangerous_h is not None and dangerous_a is not None:
        total = dangerous_h + dangerous_a
        if total > 0:
            components.append(2.0 * dangerous_h / total - 1.0)
            weights.append(_DANGEROUS_WEIGHT)

    shots_h = stats.get("shots_home")
    shots_a = stats.get("shots_away")
    if shots_h is not None and shots_a is not None:
        total = shots_h + shots_a
        if total > 0:
            components.append(2.0 * shots_h / total - 1.0)
            weights.append(_SHOTS_WEIGHT)

    if not components:
        return 0.0

    # Normalise weights to sum to 1.0
    total_w = sum(weights)
    return sum(c * w / total_w for c, w in zip(components, weights))


# ---------------------------------------------------------------------------
# Events mode
# ---------------------------------------------------------------------------

def _compute_events_mode(
    events: list[dict],
    home_team: str | None,
    away_team: str | None,
) -> list[dict]:
    """
    Build 18 buckets purely from event density and weight.

    Each bucket accumulates signed contributions from events that fall within
    its 5-minute window.  Unknown-team events contribute 0.  Empty buckets are
    0.0.  Result is clamped to [-1, 1].
    """
    raw = _collect_event_nudges(events, home_team, away_team)
    return _format_buckets(raw)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _event_to_bucket(minute: int) -> int:
    """
    Map a match minute to a bucket index (0-based).

    Minutes beyond 90 land in the last bucket.  Minute 0 also goes to bucket 0
    (0-4 maps to bucket 0, ending at minute 5).
    """
    if minute <= 0:
        return 0
    if minute > 90:
        return NUM_BUCKETS - 1
    # minute 1-5 → bucket 0 (ends at 5), 6-10 → bucket 1, …
    return min((minute - 1) // BUCKET_SIZE, NUM_BUCKETS - 1)


def _collect_event_nudges(
    events: list[dict],
    home_team: str | None,
    away_team: str | None,
) -> list[float]:
    """
    Return a list of NUM_BUCKETS floats; each is the sum of signed event
    weights in that bucket.  Positive = home, negative = away.
    Uncategorisable events (unknown team names) contribute 0.
    """
    raw = [0.0] * NUM_BUCKETS

    for evt in events:
        evt_type = (evt.get("type") or "").lower()
        weight = _EVENT_WEIGHT.get(evt_type, 0.0)
        if weight == 0.0:
            continue

        team_name = evt.get("team") or ""
        if home_team and team_name == home_team:
            direction = 1.0
        elif away_team and team_name == away_team:
            direction = -1.0
        else:
            # Team name not provided or unmatched — skip rather than guess
            continue

        minute = evt.get("minute")
        if minute is None:
            continue

        bucket_idx = _event_to_bucket(int(minute))
        raw[bucket_idx] += direction * weight

    return raw


def _clamp(v: float) -> float:
    return max(-1.0, min(1.0, v))


def _format_buckets(raw: list[float]) -> list[dict]:
    """Convert a list of raw floats to the bucket dict format, clamped."""
    return [
        {"minute": (i + 1) * BUCKET_SIZE, "value": _clamp(raw[i])}
        for i in range(NUM_BUCKETS)
    ]
