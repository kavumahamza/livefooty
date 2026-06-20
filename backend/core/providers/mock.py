"""Minimal MockProvider stub (Task 0.2). Real logic implemented in Task 1.1."""
from core.providers.base import BaseProvider


class MockProvider(BaseProvider):
    """Stub — all methods raise NotImplementedError until Task 1.1."""

    def get_fixtures(self, date: str):
        raise NotImplementedError("MockProvider.get_fixtures not implemented until Task 1.1")

    def get_live_scores(self):
        raise NotImplementedError("MockProvider.get_live_scores not implemented until Task 1.1")

    def get_events(self, fixture_id: int):
        raise NotImplementedError("MockProvider.get_events not implemented until Task 1.1")

    def get_stats(self, fixture_id: int):
        raise NotImplementedError("MockProvider.get_stats not implemented until Task 1.1")

    def get_lineups(self, fixture_id: int):
        raise NotImplementedError("MockProvider.get_lineups not implemented until Task 1.1")
