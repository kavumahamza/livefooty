/**
 * Pure helpers for fixtures grouping, live detection, and row time formatting.
 * Kept entirely presentational-free so they can be unit-tested without a DOM.
 */

/** Statuses that indicate an in-play match. */
const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'INT', 'LIVE']);

/** Statuses that are definitively finished / postponed / abandoned (not live). */
const DONE_STATUSES = new Set(['FT', 'AET', 'PEN', 'ABD', 'PST', 'CANC', 'NS', 'TBD', 'WO', 'AWD']);

/**
 * Returns true for any in-play status (1H, HT, 2H, ET, BT, P, INT, LIVE).
 * Anything unknown (not in DONE_STATUSES) is treated as live to be safe.
 */
export function isLive(status) {
  if (!status) return false;
  return LIVE_STATUSES.has(status);
}

/**
 * Returns the display string for the time column of a fixture row:
 *   - Live match  → "34'" (minute with prime, using --live color is the caller's job)
 *   - HT          → "HT"
 *   - Finished    → "FT"
 *   - Not started → "HH:MM" from kickoff_utc
 *   - Unknown     → status code
 */
export function formatRowTime(fixture) {
  const { status, minute, kickoff_utc } = fixture;

  if (status === 'HT') return 'HT';
  if (status === 'FT' || status === 'AET' || status === 'PEN') return 'FT';
  if (status === 'ABD') return 'ABD';
  if (status === 'PST') return 'PST';

  if (isLive(status)) {
    if (minute != null) return `${minute}'`;
    return status; // fallback if minute missing
  }

  // Not started (NS, TBD, etc.) — show kickoff time
  if (kickoff_utc) {
    try {
      const d = new Date(kickoff_utc);
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    } catch {
      // fall through
    }
  }

  return status || '—';
}

/**
 * Groups fixtures into live + per-league sections.
 *
 * Returns:
 * {
 *   live: FixtureDTO[],          // all in-play fixtures across all leagues
 *   leagues: [                   // remaining (non-live) fixtures, one entry per league
 *     { league: string, league_id: number|null, fixtures: FixtureDTO[] },
 *     ...
 *   ]
 * }
 *
 * Leagues are ordered by the first occurrence in the input array.
 */
export function groupFixtures(fixtures) {
  if (!Array.isArray(fixtures)) return { live: [], leagues: [] };

  const live = [];
  const leagueMap = new Map(); // key = league_id ?? league name

  for (const f of fixtures) {
    if (isLive(f.status)) {
      live.push(f);
    } else {
      const key = f.league_id != null ? f.league_id : f.league;
      if (!leagueMap.has(key)) {
        leagueMap.set(key, {
          league: f.league,
          league_id: f.league_id ?? null,
          fixtures: [],
        });
      }
      leagueMap.get(key).fixtures.push(f);
    }
  }

  return { live, leagues: Array.from(leagueMap.values()) };
}
