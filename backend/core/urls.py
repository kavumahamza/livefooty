"""
URL patterns for the core app REST endpoints.

Included by footy/urls.py under the /api/ prefix.
"""
from django.urls import path

from core.views import FixturesView, LiveView, MatchDetailView

urlpatterns = [
    path("fixtures", FixturesView.as_view(), name="api-fixtures"),
    path("live", LiveView.as_view(), name="api-live"),
    path("match/<int:fixture_id>", MatchDetailView.as_view(), name="api-match-detail"),
]
