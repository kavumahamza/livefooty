/**
 * StaleBadge — tiny "honesty UX" indicator showing data freshness.
 *
 * Props:
 *   ageSeconds  {number|null}  — from the API response `age_seconds`
 *   error       {Error|null}   — last poll error (null = ok)
 *   intervalMs  {number}       — the polling interval (used to judge "fresh")
 */

/**
 * formatAge(ageSeconds) — pure, exported for unit-testing.
 * <60   → "Ns ago"
 * 60–3599 → "Mm ago"
 * ≥3600  → "Hh ago"
 */
export function formatAge(ageSeconds) {
  if (ageSeconds < 60) return `${ageSeconds}s ago`;
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)}m ago`;
  return `${Math.floor(ageSeconds / 3600)}h ago`;
}

/**
 * StaleBadge renders a small inline badge:
 *   - error → "reconnecting…" (muted, warning dot)
 *   - ageSeconds null → "live data warming up…"
 *   - otherwise → "updated Ns ago" (green dot if fresh, muted dot if stale)
 */
export function StaleBadge({ ageSeconds, error, intervalMs }) {
  const freshThresholdSecs = (intervalMs / 1000) * 2;

  if (error) {
    return (
      <span className="stale-badge stale-badge--error" aria-live="polite">
        <span className="stale-dot stale-dot--warn" aria-hidden="true" />
        reconnecting…
      </span>
    );
  }

  if (ageSeconds == null) {
    return (
      <span className="stale-badge stale-badge--warming" aria-live="polite">
        live data warming up…
      </span>
    );
  }

  const isFresh = ageSeconds < freshThresholdSecs;

  return (
    <span
      className={`stale-badge ${isFresh ? 'stale-badge--fresh' : 'stale-badge--stale'}`}
      aria-live="polite"
    >
      <span
        className={`stale-dot ${isFresh ? 'stale-dot--live' : 'stale-dot--muted'}`}
        aria-hidden="true"
      />
      updated {formatAge(ageSeconds)}
    </span>
  );
}

export default StaleBadge;
