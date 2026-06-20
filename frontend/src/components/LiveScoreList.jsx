/**
 * LiveScoreList — polls /api/live every 20s and renders live fixtures only.
 *
 * Props:
 *   onSelectMatch  {function}  — called with fixture.id when a row is tapped
 *
 * Layout: StaleBadge at top, then league headers with FixtureRow children.
 * Empty states: warming up (null age) vs no live matches.
 */
import { useMemo } from 'react';
import { usePoll } from '../api/poll.js';
import { isLive } from './fixtures.js';
import { FixtureRow } from './FixtureRow.jsx';
import { StaleBadge } from './StaleBadge.jsx';
import './FixturesBrowser.css';  // reuse shared row / league-section CSS
import './StaleBadge.css';
import './LiveScoreList.css';

const POLL_INTERVAL = 20000;

/**
 * groupByLeague — simple group-by for live-scores (order of first occurrence).
 * Returns [{ league, league_id, fixtures }]
 */
function groupByLeague(fixtures) {
  const map = new Map();
  for (const f of fixtures) {
    const key = f.league_id != null ? f.league_id : f.league;
    if (!map.has(key)) {
      map.set(key, {
        league: f.league,
        league_id: f.league_id ?? null,
        league_logo: f.league_logo ?? null,
        league_flag: f.league_flag ?? null,
        fixtures: [],
      });
    }
    map.get(key).fixtures.push(f);
  }
  return Array.from(map.values());
}

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

export function LiveScoreList({ onSelectMatch }) {
  const { data, error } = usePoll('/api/live', POLL_INTERVAL);

  const ageSeconds = data?.age_seconds ?? null;

  // Guard: only render genuinely live fixtures
  const liveFixtures = useMemo(() => {
    const all = data?.fixtures ?? [];
    return all.filter((f) => isLive(f.status));
  }, [data]);

  const leagueGroups = useMemo(() => groupByLeague(liveFixtures), [liveFixtures]);

  const isWarming = data == null && !error;
  const isEmpty = !isWarming && liveFixtures.length === 0;

  return (
    <div className="lsl-root">
      <div className="lsl-header">
        <span className="lsl-title">Live Now</span>
        <StaleBadge ageSeconds={ageSeconds} error={error} intervalMs={POLL_INTERVAL} />
      </div>

      {isWarming && (
        <p className="lsl-empty">warming up…</p>
      )}

      {isEmpty && !error && (
        <p className="lsl-empty">No live matches right now.</p>
      )}

      {leagueGroups.map((lg) => (
        <section
          key={lg.league_id ?? lg.league}
          className="fbr-league-section"
          aria-label={lg.league}
        >
          <header className="fbr-league-header fbr-league-header--live">
            <LeagueLogoImg src={lg.league_logo} alt={`${lg.league} logo`} />
            <LeagueLogoImg src={lg.league_flag} alt={`${lg.league} flag`} />
            <span className="fbr-league-name">{lg.league}</span>
            {lg.league_id && (
              <span className="fbr-league-id" aria-hidden="true">#{lg.league_id}</span>
            )}
          </header>
          <div className="fbr-league-rows">
            {lg.fixtures.map((f) => (
              <FixtureRow key={f.id} fixture={f} onSelect={onSelectMatch} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default LiveScoreList;
