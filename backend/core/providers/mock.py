"""Real MockProvider: loads corpus JSON fixtures → normalized DTOs (Task 1.1)."""
from __future__ import annotations

import json
from pathlib import Path

from core.normalize import (
    normalize_events,
    normalize_fixtures,
    normalize_lineups,
    normalize_stats,
)
from core.providers.base import BaseProvider, EventDTO, FixtureDTO, StatsDTO

_FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _load(filename: str) -> dict:
    with open(_FIXTURES_DIR / filename, encoding="utf-8") as f:
        return json.load(f)


class MockProvider(BaseProvider):
    """Replay-based provider that reads the JSON corpus under fixtures/."""

    def get_fixtures(self, date: str) -> list[FixtureDTO]:
        data = _load("fixtures_today.json")
        return normalize_fixtures(data["response"])

    def get_live_scores(self) -> list[FixtureDTO]:
        data = _load("live_scores.json")
        return normalize_fixtures(data["response"])

    def get_events(self, fixture_id: int) -> list[EventDTO]:
        path = _FIXTURES_DIR / f"events_{fixture_id}.json"
        if not path.exists():
            return []
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return normalize_events(data["response"])

    def get_stats(self, fixture_id: int) -> StatsDTO | None:
        # Try rich file first, then sparse variant
        rich_path = _FIXTURES_DIR / f"stats_{fixture_id}.json"
        sparse_path = _FIXTURES_DIR / f"stats_sparse_{fixture_id}.json"

        if rich_path.exists():
            path = rich_path
        elif sparse_path.exists():
            path = sparse_path
        else:
            return None

        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return normalize_stats(data["response"])

    def get_lineups(self, fixture_id: int) -> dict | None:
        path = _FIXTURES_DIR / f"lineups_{fixture_id}.json"
        if not path.exists():
            return None
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return normalize_lineups(data["response"])
