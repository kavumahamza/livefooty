"""
Management command: seed_cache

Writes both "fixtures" and "live_scores" snapshots to Redis using the
configured provider (MockProvider by default), marks all live fixture ids
active, and runs refresh_active_matches once.

Usage:
    python manage.py seed_cache

Purpose:
    Makes all three REST endpoints (GET /api/fixtures, /api/live, /api/match/<id>)
    demoable WITHOUT running the live poll loop.  Also used by Task 4.x integration.

Idempotent: safe to call multiple times; each call simply overwrites the snapshots.
"""
from __future__ import annotations

import dataclasses
from datetime import date

from django.core.management.base import BaseCommand

from core.cache import get_cache
from core.match_detail import mark_active, refresh_active_matches
from core.providers import get_provider


class Command(BaseCommand):
    help = "Seed Redis cache with fixtures and live-scores from the configured provider."

    def handle(self, *args, **options):
        cache = get_cache()
        provider = get_provider()
        today = date.today().isoformat()  # e.g. "2026-06-20"; MockProvider ignores it

        self.stdout.write("Seeding fixtures snapshot …")
        fixture_dtos = provider.get_fixtures(today)
        fixtures_payload = [dataclasses.asdict(dto) for dto in fixture_dtos]
        cache.set_snapshot("fixtures", fixtures_payload)
        self.stdout.write(f"  Written {len(fixtures_payload)} fixture(s) to 'fixtures'")

        self.stdout.write("Seeding live_scores snapshot …")
        live_dtos = provider.get_live_scores()
        live_payload = [dataclasses.asdict(dto) for dto in live_dtos]
        cache.set_snapshot("live_scores", live_payload)
        self.stdout.write(f"  Written {len(live_payload)} fixture(s) to 'live_scores'")

        self.stdout.write("Marking all live fixture ids active …")
        for dto in live_dtos:
            mark_active(cache, dto.id)
            self.stdout.write(f"  active_match:{dto.id}")

        self.stdout.write("Running refresh_active_matches once …")
        refresh_active_matches(provider, cache)
        self.stdout.write("  Done.")

        self.stdout.write(self.style.SUCCESS("seed_cache complete."))
