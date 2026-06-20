import { useMemo, useState } from 'react';
import { usePoll } from '../api/poll.js';
import { groupFixtures } from './fixtures.js';
import { FixtureRow } from './FixtureRow.jsx';
import { StaleBadge } from './StaleBadge.jsx';
import { Skeleton } from './Skeleton.jsx';
import './FixturesBrowser.css';
import './StaleBadge.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Build the API URL.
 * When leagueFilter (external, from CompetitionsNav) is set it takes precedence
 * over the internal league text control (which is hidden when leagueFilter != null).
 */
function buildUrl(date, league, team, leagueFilter) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  // External league filter wins; internal filter only used when no external one
  const leagueParam = leagueFilter != null ? leagueFilter : league;
  if (leagueParam) params.set('league', leagueParam);
  if (team) params.set('team', team);
  const qs = params.toString();
  return '/api/fixtures' + (qs ? '?' + qs : '');
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LeagueLogoImg({ src, alt }) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      width={16}
      height={16}
      style={{ borderRadius: 2, objectFit: 'contain', flexShrink: 0 }}
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

function LeagueSection({ league, league_id, league_logo, league_flag, fixtures, onSelectMatch }) {
  return (
    <section className="fbr-league-section" aria-label={league}>
      <header className="fbr-league-header">
        <LeagueLogoImg src={league_logo} alt={`${league} logo`} />
        <LeagueLogoImg src={league_flag} alt={`${league} flag`} />
        <span className="fbr-league-name">{league}</span>
        {league_id && (
          <span className="fbr-league-id" aria-hidden="true">#{league_id}</span>
        )}
      </header>
      <div className="fbr-league-rows">
        {fixtures.map((f) => (
          <FixtureRow key={f.id} fixture={f} onSelect={onSelectMatch} />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * FixturesBrowser
 *
 * Props:
 *   onSelectMatch  {function}       — called with fixture id
 *   leagueFilter   {number|null}    — external league filter from CompetitionsNav.
 *                                    When set, the internal league control is
 *                                    hidden; this value is used as the league
 *                                    query param instead.
 */
export function FixturesBrowser({ onSelectMatch, leagueFilter }) {
  const [date, setDate] = useState(todayISO());
  // Internal league state — only used when leagueFilter is null
  const [league, setLeague] = useState('');
  const [team, setTeam] = useState('');

  const url = useMemo(
    () => buildUrl(date, league, team, leagueFilter),
    [date, league, team, leagueFilter]
  );

  const { data, error, loading } = usePoll(url, 30000);

  const fixtures = data?.fixtures ?? [];
  const ageSeconds = data?.age_seconds ?? null;
  // firstLoad: no data AND no error yet — show skeletons
  const firstLoad = data == null && !error;
  const isColdCache = !firstLoad && Array.isArray(fixtures) && fixtures.length === 0 && ageSeconds == null;

  const { live: liveFixtures, leagues } = useMemo(
    () => groupFixtures(fixtures),
    [fixtures]
  );

  // League options for the internal datalist — only relevant when leagueFilter is null
  const leagueOptions = useMemo(() => {
    if (leagueFilter != null) return [];
    const seen = new Map();
    for (const f of fixtures) {
      const k = f.league_id ?? f.league;
      if (!seen.has(k)) seen.set(k, { id: f.league_id, name: f.league });
    }
    return Array.from(seen.values());
  }, [fixtures, leagueFilter]);

  return (
    <div className="fbr-root">
      {/* Filter controls */}
      <div className="fbr-filters" role="search" aria-label="Fixture filters">
        <label className="fbr-filter-label">
          <span className="fbr-filter-text">Date</span>
          <input
            type="date"
            className="fbr-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Filter by date"
          />
        </label>

        {/* League control: hidden when CompetitionsNav owns league selection */}
        {leagueFilter == null && (
          <label className="fbr-filter-label">
            <span className="fbr-filter-text">League</span>
            <input
              type="text"
              className="fbr-input"
              placeholder="League name or ID"
              value={league}
              onChange={(e) => setLeague(e.target.value)}
              list="fbr-league-datalist"
              aria-label="Filter by league"
            />
            {leagueOptions.length > 0 && (
              <datalist id="fbr-league-datalist">
                {leagueOptions.map((l) => (
                  <option key={l.id ?? l.name} value={l.name} />
                ))}
              </datalist>
            )}
          </label>
        )}

        <label className="fbr-filter-label">
          <span className="fbr-filter-text">Team</span>
          <input
            type="text"
            className="fbr-input"
            placeholder="Team name"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            aria-label="Filter by team"
          />
        </label>
      </div>

      {/* Status bar — StaleBadge replaces inline staleness text */}
      <div className="fbr-statusbar">
        {loading && <span className="fbr-muted">Fetching…</span>}
        {!loading && (
          <StaleBadge ageSeconds={ageSeconds} error={error} intervalMs={30000} />
        )}
      </div>

      {/* Skeleton loading rows — first load before any data arrives */}
      {firstLoad && (
        <div className="fbr-skeleton-rows" aria-label="Loading fixtures" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="fbr-skeleton-row">
              <Skeleton width={22} height={22} radius="50%" />
              <Skeleton width="35%" height={13} />
              <Skeleton width={52} height={16} />
              <Skeleton width="35%" height={13} />
              <Skeleton width={22} height={22} radius="50%" />
            </div>
          ))}
        </div>
      )}

      {/* Cold-cache / empty states — only after data has arrived */}
      {!firstLoad && isColdCache && !error && (
        <p className="fbr-empty">Loading live data…</p>
      )}
      {!firstLoad && !isColdCache && fixtures.length === 0 && !error && (
        <p className="fbr-empty">No matches found for these filters.</p>
      )}

      {/* Live section — surfaced at the top across all leagues */}
      {liveFixtures.length > 0 && (
        <section className="fbr-league-section fbr-live-section" aria-label="Live now">
          <header className="fbr-league-header fbr-league-header--live">
            <span className="fbr-live-badge">LIVE</span>
          </header>
          <div className="fbr-league-rows">
            {liveFixtures.map((f) => (
              <FixtureRow key={f.id} fixture={f} onSelect={onSelectMatch} />
            ))}
          </div>
        </section>
      )}

      {/* Per-league groups (non-live fixtures) */}
      {leagues.map((lg) => (
        <LeagueSection
          key={lg.league_id ?? lg.league}
          league={lg.league}
          league_id={lg.league_id}
          league_logo={lg.league_logo}
          league_flag={lg.league_flag}
          fixtures={lg.fixtures}
          onSelectMatch={onSelectMatch}
        />
      ))}
    </div>
  );
}

export default FixturesBrowser;
