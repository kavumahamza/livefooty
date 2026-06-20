"""Tests for MockProvider + normalize.py (Task 1.1)."""
import pytest

from core.providers.mock import MockProvider


@pytest.fixture
def provider():
    return MockProvider()


# ---------------------------------------------------------------------------
# get_live_scores
# ---------------------------------------------------------------------------

def test_live_scores_returns_fixture_dtos(provider):
    scores = provider.get_live_scores()
    assert len(scores) > 0, "Expected at least one live score"


def test_live_scores_known_fixture_status_and_minute(provider):
    """Fixture 1035037 in live_scores.json: status=1H, minute=34, 1-0."""
    scores = provider.get_live_scores()
    fix = next((f for f in scores if f.id == 1035037), None)
    assert fix is not None, "Fixture 1035037 not found in live scores"
    assert fix.status == "1H"
    assert fix.minute == 34
    assert fix.home_score == 1
    assert fix.away_score == 0
    assert fix.home == "Manchester United"
    assert fix.away == "Newcastle"


# ---------------------------------------------------------------------------
# get_stats — rich (1035037)
# ---------------------------------------------------------------------------

def test_stats_rich_attacks_not_none(provider):
    stats = provider.get_stats(1035037)
    assert stats is not None
    assert stats.attacks_home is not None
    assert stats.attacks_away is not None
    assert stats.attacks_home == 78
    assert stats.attacks_away == 61


def test_stats_rich_possession_parsed_to_int(provider):
    stats = provider.get_stats(1035037)
    assert stats is not None
    assert stats.possession_home == 55   # "55%" → 55
    assert stats.possession_away == 45


def test_stats_rich_shots(provider):
    stats = provider.get_stats(1035037)
    assert stats is not None
    assert stats.shots_home == 8
    assert stats.shots_away == 7


# ---------------------------------------------------------------------------
# get_stats — sparse (2045102)
# ---------------------------------------------------------------------------

def test_stats_sparse_does_not_raise(provider):
    """Sparse file has no Attacks / Dangerous Attacks — must not crash."""
    stats = provider.get_stats(2045102)
    assert stats is not None


def test_stats_sparse_attacks_none(provider):
    stats = provider.get_stats(2045102)
    assert stats.attacks_home is None
    assert stats.attacks_away is None


def test_stats_sparse_dangerous_none(provider):
    stats = provider.get_stats(2045102)
    assert stats.dangerous_home is None
    assert stats.dangerous_away is None


def test_stats_sparse_shots_present(provider):
    """Sparse still has Total Shots."""
    stats = provider.get_stats(2045102)
    assert stats.shots_home == 6
    assert stats.shots_away == 5


def test_stats_unknown_id_returns_none(provider):
    assert provider.get_stats(9999999) is None


# ---------------------------------------------------------------------------
# get_events
# ---------------------------------------------------------------------------

def test_events_subst_type_mapped(provider):
    """The lowercase 'subst' raw type must map to 'subst' in EventDTO."""
    events = provider.get_events(1035037)
    subst_events = [e for e in events if e.type == "subst"]
    assert len(subst_events) >= 1, "Expected at least one substitution event"


def test_events_goal_type_mapped(provider):
    events = provider.get_events(1035037)
    goal_events = [e for e in events if e.type == "goal"]
    assert len(goal_events) >= 1, "Expected at least one goal event"


def test_events_var_excluded(provider):
    """Var events must be dropped from the normalized list."""
    events = provider.get_events(1035037)
    var_events = [e for e in events if e.type == "var"]
    assert var_events == [], "Var events should be excluded"


def test_events_known_goal(provider):
    """First event: Rashford goal at minute 12 for Man Utd."""
    events = provider.get_events(1035037)
    first_goal = next((e for e in events if e.type == "goal"), None)
    assert first_goal is not None
    assert first_goal.minute == 12
    assert first_goal.player == "M. Rashford"
    assert first_goal.assist == "B. Fernandes"
    assert first_goal.team == "Manchester United"


def test_events_unknown_fixture_returns_empty(provider):
    assert provider.get_events(9999999) == []


# ---------------------------------------------------------------------------
# get_lineups
# ---------------------------------------------------------------------------

def test_lineups_returns_home_and_away(provider):
    lineups = provider.get_lineups(1035037)
    assert lineups is not None
    assert "home" in lineups
    assert "away" in lineups
    assert len(lineups["home"]) == 11
    assert len(lineups["away"]) == 11


def test_lineups_known_player(provider):
    lineups = provider.get_lineups(1035037)
    assert "A. Onana" in lineups["home"]


def test_lineups_unknown_fixture_returns_none(provider):
    assert provider.get_lineups(9999999) is None
