"""
Management command: run_poller

Starts the single-process live-score poller.  Intended to run as a long-lived
background process (e.g. in Docker via docker-compose or a Procfile).

Usage::

    python manage.py run_poller

Reads configuration from Django settings:
    REDIS_URL     — Redis connection URL (default: redis://localhost:6379/0)
    POLL_INTERVAL — seconds between poll cycles (default: 20)

The Redis leader lock ensures that even if this command is accidentally started
twice (e.g. in a scaled-out deployment), only one poller writes to the cache.
"""

import uuid

import redis
from django.conf import settings
from django.core.management.base import BaseCommand

from core.cache import get_cache
from core.poller import run_loop
from core.providers import get_provider


class Command(BaseCommand):
    help = "Run the live-score poller (single process, Redis leader lock)."

    def handle(self, *args, **options):
        provider = get_provider()
        cache = get_cache()
        redis_client = redis.from_url(settings.REDIS_URL)
        token = uuid.uuid4().hex
        interval = getattr(settings, "POLL_INTERVAL", 20)

        self.stdout.write(
            f"[run_poller] Starting poller — token={token}, interval={interval}s, "
            f"redis={settings.REDIS_URL}"
        )

        run_loop(
            provider=provider,
            cache=cache,
            redis_client=redis_client,
            token=token,
            interval=interval,
            max_cycles=None,  # infinite in production
        )
