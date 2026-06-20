"""Provider DTOs and BaseProvider contract (Task 0.2)."""
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


class BaseProvider:
    def get_fixtures(self, date: str) -> list[FixtureDTO]: raise NotImplementedError
    def get_live_scores(self) -> list[FixtureDTO]: raise NotImplementedError
    def get_events(self, fixture_id: int) -> list[EventDTO]: raise NotImplementedError
    def get_stats(self, fixture_id: int) -> "StatsDTO | None": raise NotImplementedError
    def get_lineups(self, fixture_id: int) -> dict | None: raise NotImplementedError
