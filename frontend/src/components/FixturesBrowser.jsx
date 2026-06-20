import { useMemo, useState } from 'react';
import { usePoll } from '../api/poll.js';
import { groupFixtures, isLive, formatRowTime } from './fixtures.js';
import './FixturesBrowser.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function buildUrl(date, league, team) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (league) params.set('league', league);
  if (team) params.set('team', team);
  const qs = params.toString();
  return '/api/fixtures' + (qs ? '?' + qs : '');
}

function scoreStr(home, away, status) {
  if (home == null || away == null) {
    if (status === 'NS' || status === 'TBD') return '– : –';
    return '? : ?';
  }
  return `${home} : ${away}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LiveDot() {
  return (
    <span className="fbr-live-dot" aria-hidden="true" title="Live" />
  );
}

function FixtureRow({ fixture, onSelectMatch }) {
  const live = isLive(fixture.status);
  const timeLabel = formatRowTime(fixture);

  function handleClick() {
    onSelectMatch?.(fixture.id);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelectMatch?.(fixture.id);
    }
  }

  return (
    <button
      className={`fbr-row${live ? ' fbr-row--live' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`${fixture.home} vs ${fixture.away}, ${timeLabel}`}
      type="button"
    >
      <span className={`fbr-time${live ? ' fbr-time--live' : ''}`}>
        {timeLabel}
      </span>
      <span className="fbr-home">{fixture.home}</span>
      <span className="fbr-score">
        {scoreStr(fixture.home_score, fixture.away_score, fixture.status)}
      </span>
      <span className="fbr-away">{fixture.away}</span>
      {live && <LiveDot />}
    </button>
  );
}

function LeagueSection({ league, league_id, fixtures, onSelectMatch }) {
  return (
    <section className="fbr-league-section" aria-label={league}>
      <header className="fbr-league-header">
        <span className="fbr-league-name">{league}</span>
        {league_id && (
          <span className="fbr-league-id" aria-hidden="true">#{league_id}</span>
        )}
      </header>
      <div className="fbr-league-rows">
        {fixtures.map((f) => (
          <FixtureRow key={f.id} fixture={f} onSelectMatch={onSelectMatch} />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FixturesBrowser({ onSelectMatch }) {
  const [date, setDate] = useState(todayISO());
  const [league, setLeague] = useState('');
  const [team, setTeam] = useState('');

  const url = useMemo(() => buildUrl(date, league, team), [date, league, team]);

  const { data, error, loading } = usePoll(url, 30000);

  const fixtures = data?.fixtures ?? [];
  const ageSeconds = data?.age_seconds ?? null;
  const isColdCache = Array.isArray(fixtures) && fixtures.length === 0 && ageSeconds == null;

  const { live: liveFixtures, leagues } = useMemo(
    () => groupFixtures(fixtures),
    [fixtures]
  );

  // Derive league options from the full (unfiltered) fixture list for the select
  // — we use whatever the backend returned after the league filter, so options
  // reflect what's available.
  const leagueOptions = useMemo(() => {
    const seen = new Map();
    for (const f of fixtures) {
      const k = f.league_id ?? f.league;
      if (!seen.has(k)) seen.set(k, { id: f.league_id, name: f.league });
    }
    return Array.from(seen.values());
  }, [fixtures]);

  // Staleness text
  let staleText = null;
  if (ageSeconds != null) {
    staleText = `updated ${ageSeconds}s ago`;
  }

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

      {/* Status bar */}
      <div className="fbr-statusbar">
        {loading && <span className="fbr-muted">Fetching…</span>}
        {error && !loading && (
          <span className="fbr-error">Connection error — retrying</span>
        )}
        {staleText && !error && (
          <span className="fbr-muted">{staleText}</span>
        )}
      </div>

      {/* Cold-cache / empty states */}
      {isColdCache && !loading && !error && (
        <p className="fbr-empty">Loading live data…</p>
      )}
      {!isColdCache && !loading && fixtures.length === 0 && !error && (
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
              <FixtureRow key={f.id} fixture={f} onSelectMatch={onSelectMatch} />
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
          fixtures={lg.fixtures}
          onSelectMatch={onSelectMatch}
        />
      ))}
    </div>
  );
}

export default FixturesBrowser;
