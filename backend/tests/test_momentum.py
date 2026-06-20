"""
Tests for core/momentum.py

Coverage
--------
1. Rich stats (attacks_home/away non-None, fixture 1035037) → mode=="stats",
   18 buckets, values in [-1,1], aggregate tilt positive (home attacks > away).
2. Sparse stats (attacks_home/away None, fixture 2045102) → mode=="events",
   no raise, 18 buckets, values in [-1,1].
3. stats=None and events=[] → mode=="events", all buckets 0.0, no raise.
4. Event side assignment: home goal at minute 12 → bucket[2] (ending at 15) > 0.
5. Event side assignment: away goal at minute 80 → bucket[15] (ending at 80) < 0.
6. Clamp: event at minute 96 → lands in last bucket (minute=90), no crash.
7. No team names provided → still returns valid structure (all-zero events mode).
"""
from __future__ import annotations

import pytest

from core.momentum import compute_momentum, NUM_BUCKETS, BUCKET_SIZE


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_detail(stats=None, events=None, lineups=None, fixture_id=9999):
    return {
        "fixture_id": fixture_id,
        "events": events if events is not None else [],
        "stats": stats,
        "lineups": lineups,
    }


def _rich_stats():
    """Stats from fixture 1035037 — attacks_home=78, attacks_away=61."""
    return {
        "possession_home": 55,
        "possession_away": 45,
        "shots_home": 8,
        "shots_away": 7,
        "attacks_home": 78,
        "attacks_away": 61,
        "dangerous_home": 42,
        "dangerous_away": 31,
    }


def _sparse_stats():
    """Stats from fixture 2045102 — no Attacks entries, so attacks_home/away absent."""
    return {
        "possession_home": 48,
        "possession_away": 52,
        "shots_home": 6,
        "shots_away": 5,
        "attacks_home": None,
        "attacks_away": None,
        "dangerous_home": None,
        "dangerous_away": None,
    }


def _goal_event(minute, team):
    return {"minute": minute, "type": "goal", "detail": "Normal Goal", "team": team, "player": None, "assist": None}


def _card_event(minute, team):
    return {"minute": minute, "type": "card", "detail": "Yellow Card", "team": team, "player": None, "assist": None}


def _subst_event(minute, team):
    return {"minute": minute, "type": "subst", "detail": "Substitution 1", "team": team, "player": None, "assist": None}


# ---------------------------------------------------------------------------
# Test 1: Rich stats → mode=="stats", 18 buckets, tilt positive
# ---------------------------------------------------------------------------

class TestRichStats:
    HOME = "Manchester United"
    AWAY = "Newcastle"

    def test_mode_is_stats(self):
        detail = _make_detail(stats=_rich_stats())
        result = compute_momentum(detail, home_team=self.HOME, away_team=self.AWAY)
        assert result["mode"] == "stats"

    def test_caption(self):
        detail = _make_detail(stats=_rich_stats())
        result = compute_momentum(detail, home_team=self.HOME, away_team=self.AWAY)
        assert result["caption"] == "based on live stats"

    def test_18_buckets(self):
        detail = _make_detail(stats=_rich_stats())
        result = compute_momentum(detail, home_team=self.HOME, away_team=self.AWAY)
        assert len(result["buckets"]) == NUM_BUCKETS == 18

    def test_bucket_minute_labels(self):
        detail = _make_detail(stats=_rich_stats())
        result = compute_momentum(detail, home_team=self.HOME, away_team=self.AWAY)
        minutes = [b["minute"] for b in result["buckets"]]
        assert minutes == list(range(BUCKET_SIZE, NUM_BUCKETS * BUCKET_SIZE + 1, BUCKET_SIZE))

    def test_all_values_in_range(self):
        detail = _make_detail(stats=_rich_stats())
        result = compute_momentum(detail, home_team=self.HOME, away_team=self.AWAY)
        for b in result["buckets"]:
            assert -1.0 <= b["value"] <= 1.0, f"Out of range: {b}"

    def test_aggregate_tilt_positive(self):
        """
        attacks_home=78 > attacks_away=61 → mean bucket value should be positive
        (home has more aggregate pressure, so the baseline is positive).
        """
        detail = _make_detail(stats=_rich_stats())
        result = compute_momentum(detail, home_team=self.HOME, away_team=self.AWAY)
        mean_val = sum(b["value"] for b in result["buckets"]) / len(result["buckets"])
        assert mean_val > 0.0, f"Expected positive mean for home-dominant stats, got {mean_val}"


# ---------------------------------------------------------------------------
# Test 2: Sparse stats (attacks None) → mode=="events"
# ---------------------------------------------------------------------------

class TestSparseStats:
    HOME = "Atletico Madrid"
    AWAY = "Valencia"

    def test_mode_is_events(self):
        detail = _make_detail(stats=_sparse_stats())
        result = compute_momentum(detail, home_team=self.HOME, away_team=self.AWAY)
        assert result["mode"] == "events"

    def test_caption(self):
        detail = _make_detail(stats=_sparse_stats())
        result = compute_momentum(detail, home_team=self.HOME, away_team=self.AWAY)
        assert result["caption"] == "based on match events"

    def test_does_not_raise(self):
        detail = _make_detail(stats=_sparse_stats())
        result = compute_momentum(detail, home_team=self.HOME, away_team=self.AWAY)
        assert result is not None

    def test_18_buckets(self):
        detail = _make_detail(stats=_sparse_stats())
        result = compute_momentum(detail, home_team=self.HOME, away_team=self.AWAY)
        assert len(result["buckets"]) == 18

    def test_all_values_in_range(self):
        detail = _make_detail(stats=_sparse_stats())
        result = compute_momentum(detail, home_team=self.HOME, away_team=self.AWAY)
        for b in result["buckets"]:
            assert -1.0 <= b["value"] <= 1.0


# ---------------------------------------------------------------------------
# Test 3: stats=None and events=[] → mode=="events", all zeros
# ---------------------------------------------------------------------------

class TestNullStatsNoEvents:
    def test_mode_is_events(self):
        detail = _make_detail(stats=None, events=[])
        result = compute_momentum(detail)
        assert result["mode"] == "events"

    def test_all_buckets_zero(self):
        detail = _make_detail(stats=None, events=[])
        result = compute_momentum(detail)
        for b in result["buckets"]:
            assert b["value"] == 0.0, f"Expected 0.0, got {b}"

    def test_18_buckets(self):
        detail = _make_detail(stats=None, events=[])
        result = compute_momentum(detail)
        assert len(result["buckets"]) == 18

    def test_does_not_raise(self):
        # Belt-and-suspenders: call with no optional args at all
        result = compute_momentum({"fixture_id": 0, "events": [], "stats": None, "lineups": None})
        assert result is not None


# ---------------------------------------------------------------------------
# Test 4: Home goal at minute 12 → bucket ending at 15 is positive
# ---------------------------------------------------------------------------

class TestEventSideAssignmentHomeGoal:
    HOME = "Home FC"
    AWAY = "Away FC"

    def test_home_goal_minute_12_positive(self):
        events = [_goal_event(12, self.HOME)]
        detail = _make_detail(stats=None, events=events)
        result = compute_momentum(detail, home_team=self.HOME, away_team=self.AWAY)
        # minute 12 → bucket idx 2 (minutes 11-15 → (12-1)//5 = 2), ending at 15
        bucket_15 = next(b for b in result["buckets"] if b["minute"] == 15)
        assert bucket_15["value"] > 0.0, f"Expected positive for home goal at min 12, got {bucket_15['value']}"


# ---------------------------------------------------------------------------
# Test 5: Away goal at minute 80 → bucket ending at 80 is negative
# ---------------------------------------------------------------------------

class TestEventSideAssignmentAwayGoal:
    HOME = "Home FC"
    AWAY = "Away FC"

    def test_away_goal_minute_80_negative(self):
        events = [_goal_event(80, self.AWAY)]
        detail = _make_detail(stats=None, events=events)
        result = compute_momentum(detail, home_team=self.HOME, away_team=self.AWAY)
        # minute 80 → bucket idx 15 (79//5 = 15), ending at 80
        bucket_80 = next(b for b in result["buckets"] if b["minute"] == 80)
        assert bucket_80["value"] < 0.0, f"Expected negative for away goal at min 80, got {bucket_80['value']}"


# ---------------------------------------------------------------------------
# Test 6: Clamp — event at minute 96 lands in last bucket, no crash
# ---------------------------------------------------------------------------

class TestMinuteClamping:
    HOME = "Home FC"
    AWAY = "Away FC"

    def test_minute_96_no_crash(self):
        events = [_goal_event(96, self.HOME)]
        detail = _make_detail(stats=None, events=events)
        result = compute_momentum(detail, home_team=self.HOME, away_team=self.AWAY)
        assert result is not None

    def test_minute_96_lands_in_last_bucket(self):
        events = [_goal_event(96, self.HOME)]
        detail = _make_detail(stats=None, events=events)
        result = compute_momentum(detail, home_team=self.HOME, away_team=self.AWAY)
        last_bucket = result["buckets"][-1]
        assert last_bucket["minute"] == 90
        assert last_bucket["value"] > 0.0, "Home goal at min 96 should land in bucket 90 with positive value"

    def test_minute_91_also_last_bucket(self):
        """Any minute > 90 should go to the last bucket."""
        events = [_goal_event(91, self.AWAY)]
        detail = _make_detail(stats=None, events=events)
        result = compute_momentum(detail, home_team=self.HOME, away_team=self.AWAY)
        last_bucket = result["buckets"][-1]
        assert last_bucket["minute"] == 90
        assert last_bucket["value"] < 0.0


# ---------------------------------------------------------------------------
# Test 7: No team names → valid structure, all-zero events mode
# ---------------------------------------------------------------------------

class TestNoTeamNames:
    def test_returns_valid_structure_no_names(self):
        events = [_goal_event(30, "Some Team")]
        detail = _make_detail(stats=None, events=events)
        # No home_team or away_team provided → team cannot be resolved
        result = compute_momentum(detail)
        assert result["mode"] == "events"
        assert len(result["buckets"]) == 18
        for b in result["buckets"]:
            assert -1.0 <= b["value"] <= 1.0

    def test_unresolvable_events_produce_zero_buckets(self):
        """When team names not provided, all event contributions = 0."""
        events = [_goal_event(10, "Mystery Team"), _card_event(45, "Other Team")]
        detail = _make_detail(stats=None, events=events)
        result = compute_momentum(detail)
        for b in result["buckets"]:
            assert b["value"] == 0.0


# ---------------------------------------------------------------------------
# Test 8: Multiple events in one bucket accumulate correctly
# ---------------------------------------------------------------------------

class TestMultipleEventsInOneBucket:
    HOME = "Home FC"
    AWAY = "Away FC"

    def test_two_home_goals_same_bucket(self):
        """Two home goals in bucket 0 (min 1-5) should sum, clamped to 1.0."""
        events = [_goal_event(2, self.HOME), _goal_event(4, self.HOME)]
        detail = _make_detail(stats=None, events=events)
        result = compute_momentum(detail, home_team=self.HOME, away_team=self.AWAY)
        bucket_5 = next(b for b in result["buckets"] if b["minute"] == 5)
        # 2.0 weight before clamping → should be clamped to 1.0
        assert bucket_5["value"] == 1.0

    def test_opposing_events_in_same_bucket_cancel(self):
        """One home goal and one away goal of equal weight in same bucket → near 0."""
        events = [_goal_event(7, self.HOME), _goal_event(8, self.AWAY)]
        detail = _make_detail(stats=None, events=events)
        result = compute_momentum(detail, home_team=self.HOME, away_team=self.AWAY)
        bucket_10 = next(b for b in result["buckets"] if b["minute"] == 10)
        assert bucket_10["value"] == 0.0


# ---------------------------------------------------------------------------
# Test 9: Bucket minute boundaries
# ---------------------------------------------------------------------------

class TestBucketBoundaries:
    HOME = "Home FC"
    AWAY = "Away FC"

    def test_minute_5_in_bucket_5(self):
        """Minute 5 should land in bucket ending at minute 5 (index 0)."""
        events = [_goal_event(5, self.HOME)]
        detail = _make_detail(stats=None, events=events)
        result = compute_momentum(detail, home_team=self.HOME, away_team=self.AWAY)
        bucket_5 = result["buckets"][0]
        assert bucket_5["minute"] == 5
        assert bucket_5["value"] > 0.0

    def test_minute_6_in_bucket_10(self):
        """Minute 6 should land in bucket ending at minute 10 (index 1)."""
        events = [_goal_event(6, self.HOME)]
        detail = _make_detail(stats=None, events=events)
        result = compute_momentum(detail, home_team=self.HOME, away_team=self.AWAY)
        bucket_10 = result["buckets"][1]
        assert bucket_10["minute"] == 10
        assert bucket_10["value"] > 0.0

    def test_minute_90_in_last_bucket(self):
        events = [_goal_event(90, self.AWAY)]
        detail = _make_detail(stats=None, events=events)
        result = compute_momentum(detail, home_team=self.HOME, away_team=self.AWAY)
        last_bucket = result["buckets"][-1]
        assert last_bucket["minute"] == 90
        assert last_bucket["value"] < 0.0
