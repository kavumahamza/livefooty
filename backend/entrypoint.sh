#!/bin/sh
set -e

# Run migrations so Django's session/auth tables exist (idempotent).
python manage.py migrate --noinput

exec "$@"
