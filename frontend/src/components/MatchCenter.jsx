/**
 * MatchCenter — Cinematic SofaScore-style full-page tabbed match detail.
 *
 * Props:
 *   fixtureId  {number|string}  — the fixture to display
 *   onBack     {function}       — called when the user presses Back
 *
 * Polls /api/match/<fixtureId> every 45s via usePoll.
 * Tabs: Summary · Lineups · Stats
 */
import { useState, useRef, useEffect } from 'react';
import { usePoll } from '../api/poll.js';
import { StaleBadge } from './StaleBadge.jsx';
import { MomentumStrip } from './MomentumStrip.jsx';
import { TeamCrest } from './TeamCrest.jsx';
import { Skeleton } from './Skeleton.jsx';
import { isLive } from './fixtures.js';
import { eventSide, eventIcon, sortedEvents, teamColor } from './matchcenter.js';
import './MatchCenter.css';

// ---------------------------------------------------------------------------
// MatchHeader — cinematic hero with team-tint underglow + score-pop
// ---------------------------------------------------------------------------
function MatchHeader({ fixture, ageSeconds, error, onBack }) {
  const prevScoreRef = useRef(null);
  const [scorePop, setScorePop] = useState(false);

  useEffect(() => {
    if (!fixture) return;
    const key = `${fixture.home_score}-${fixture.away_score}`;
    if (prevScoreRef.current !== null && prevScoreRef.current !== key) {
      setScorePop(true);
      const t = setTimeout(() => setScorePop(false), 500);
      return () => clearTimeout(t);
    }
    prevScoreRef.current = key;
  }, [fixture?.home_score, fixture?.away_score]);

  if (!fixture) {
    return (
      <div className="mc-header mc-header--loading">
        <button className="mc-back-btn" onClick={onBack} type="button" aria-label="Back">
          ← Back
        </button>
        <div className="mc-hero-skeleton">
          <Skeleton width={48} height={48} radius="var(--r-sm)" />
          <div className="mc-hero-skeleton-score">
            <Skeleton width={120} height={40} radius="var(--r-sm)" />
            <Skeleton width={60} height={16} radius="var(--r-sm)" />
          </div>
          <Skeleton width={48} height={48} radius="var(--r-sm)" />
        </div>
        <StaleBadge ageSeconds={ageSeconds} error={error} intervalMs={45000} />
      </div>
    );
  }

  const live = isLive(fixture.status);
  const minuteDisplay = live
    ? (fixture.minute != null ? `${fixture.minute}'` : fixture.status)
    : fixture.status === 'FT' ? 'FT'
    : fixture.status === 'HT' ? 'HT'
    : fixture.kickoff_utc
    ? new Date(fixture.kickoff_utc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : fixture.status || '—';

  const tintHome = teamColor(fixture.home);
  const tintAway = teamColor(fixture.away);

  return (
    <div
      className="mc-header glass"
      style={{ '--tint-home': tintHome, '--tint-away': tintAway }}
    >
      {/* Team color underglow: subtle radial gradient behind each side */}
      <div className="mc-header-glow mc-header-glow--home" aria-hidden="true" />
      <div className="mc-header-glow mc-header-glow--away" aria-hidden="true" />

      <button className="mc-back-btn" onClick={onBack} type="button" aria-label="Back">
        ← Back
      </button>

      <div className="mc-scoreline">
        {/* Home team */}
        <div className="mc-team mc-team--home">
          <TeamCrest name={fixture.home} logo={fixture.home_logo} size={48} />
          <span className="mc-team-name">{fixture.home}</span>
        </div>

        {/* Score block */}
        <div className="mc-score-block">
          <span className={`mc-score tabular${scorePop ? ' score-pop' : ''}`}>
            {fixture.home_score ?? '–'}&nbsp;–&nbsp;{fixture.away_score ?? '–'}
          </span>
          {/* Status pill */}
          <span className={`mc-status-pill${live ? ' mc-status-pill--live' : ''}`}>
            {live && <span className="live-dot" aria-hidden="true" />}
            <span style={{ color: live ? 'var(--live)' : 'var(--muted)' }}>
              {minuteDisplay}
            </span>
          </span>
        </div>

        {/* Away team */}
        <div className="mc-team mc-team--away">
          <span className="mc-team-name">{fixture.away}</span>
          <TeamCrest name={fixture.away} logo={fixture.away_logo} size={48} />
        </div>
      </div>

      <div className="mc-header-meta">
        {fixture.league && <span className="mc-league">{fixture.league}</span>}
        <StaleBadge ageSeconds={ageSeconds} error={error} intervalMs={45000} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TabStrip — animated sliding indicator
// ---------------------------------------------------------------------------
const TABS = ['Summary', 'Lineups', 'Stats'];

function TabStrip({ active, onSelect }) {
  const activeIdx = TABS.indexOf(active);
  return (
    <div className="mc-tabs" role="tablist" aria-label="Match sections">
      {TABS.map((tab) => (
        <button
          key={tab}
          role="tab"
          aria-selected={active === tab}
          className={`mc-tab${active === tab ? ' mc-tab--active' : ''}`}
          onClick={() => onSelect(tab)}
          type="button"
        >
          {tab}
        </button>
      ))}
      {/* Sliding indicator bar */}
      <div
        className="mc-tab-indicator"
        style={{ transform: `translateX(${activeIdx * 100}%)` }}
        aria-hidden="true"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// EventRow — colored chip with side-specific layout
// ---------------------------------------------------------------------------
function EventRow({ event, fixture }) {
  const side = eventSide(event, fixture?.home, fixture?.away);
  const icon = eventIcon(event);
  const minuteLabel = `${event.minute}'`;
  const playerLabel = event.player || '';
  const assistLabel = event.type === 'goal' && event.assist ? `assist: ${event.assist}` : '';
  const chipColor =
    side === 'home' ? 'var(--home)' : side === 'away' ? 'var(--away)' : 'var(--border)';

  if (side === 'home') {
    return (
      <div className="mc-event mc-event--home">
        <div className="mc-event-content mc-event-content--home">
          <span className="mc-event-chip" style={{ '--chip-accent': chipColor }}>
            <span className="mc-event-icon">{icon}</span>
            <span className="mc-event-player">{playerLabel}</span>
            {assistLabel && <span className="mc-event-assist">{assistLabel}</span>}
          </span>
        </div>
        <div className="mc-event-spine">
          <span className="mc-event-minute">{minuteLabel}</span>
        </div>
        <div className="mc-event-content mc-event-content--away" />
      </div>
    );
  }

  if (side === 'away') {
    return (
      <div className="mc-event mc-event--away">
        <div className="mc-event-content mc-event-content--home" />
        <div className="mc-event-spine">
          <span className="mc-event-minute">{minuteLabel}</span>
        </div>
        <div className="mc-event-content mc-event-content--away">
          <span className="mc-event-chip" style={{ '--chip-accent': chipColor }}>
            <span className="mc-event-icon">{icon}</span>
            <span className="mc-event-player">{playerLabel}</span>
            {assistLabel && <span className="mc-event-assist">{assistLabel}</span>}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mc-event mc-event--neutral">
      <div className="mc-event-content mc-event-content--home" />
      <div className="mc-event-spine">
        <span className="mc-event-minute">{minuteLabel}</span>
        <span className="mc-event-chip" style={{ '--chip-accent': chipColor }}>
          <span className="mc-event-icon">{icon}</span>
          <span className="mc-event-player">{playerLabel}</span>
        </span>
      </div>
      <div className="mc-event-content mc-event-content--away" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SummaryTab — MomentumStrip wired with events + team names + timeline
// ---------------------------------------------------------------------------
function SummaryTab({ momentum, events, fixture }) {
  const sorted = sortedEvents(events);

  return (
    <div className="mc-summary-tab">
      <MomentumStrip
        momentum={momentum}
        events={events}
        homeTeam={fixture?.home}
        awayTeam={fixture?.away}
      />
      <div className="mc-timeline">
        <div className="mc-timeline-header">
          <span className="mc-tl-team-label mc-tl-team-label--home">{fixture?.home}</span>
          <span className="mc-tl-spine-label" />
          <span className="mc-tl-team-label mc-tl-team-label--away">{fixture?.away}</span>
        </div>

        {sorted.length === 0 ? (
          <div className="mc-no-events">No events yet.</div>
        ) : (
          sorted.map((event, i) => (
            <EventRow key={`${event.minute}-${event.type}-${i}`} event={event} fixture={fixture} />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LineupsTab — glass columns
// ---------------------------------------------------------------------------
function extractName(player) {
  if (!player) return '?';
  if (typeof player === 'string') return player;
  if (typeof player === 'object') {
    return player.name ?? player.player ?? JSON.stringify(player);
  }
  return String(player);
}

function LineupsTab({ lineups }) {
  if (!lineups) {
    return <div className="mc-unavailable">Lineups unavailable.</div>;
  }

  const homeList = Array.isArray(lineups.home) ? lineups.home : [];
  const awayList = Array.isArray(lineups.away) ? lineups.away : [];

  return (
    <div className="mc-lineups-tab">
      <div className="mc-lineups-columns">
        <div className="mc-lineup-col glass">
          <div className="mc-lineup-col-header">Home XI</div>
          <ol className="mc-lineup-list">
            {homeList.map((p, i) => (
              <li key={i} className="mc-lineup-player">{extractName(p)}</li>
            ))}
          </ol>
        </div>
        <div className="mc-lineup-col glass">
          <div className="mc-lineup-col-header">Away XI</div>
          <ol className="mc-lineup-list">
            {awayList.map((p, i) => (
              <li key={i} className="mc-lineup-player">{extractName(p)}</li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatsTab — animated fill bars
// ---------------------------------------------------------------------------
const STAT_DEFS = [
  { label: 'Possession %',      homeKey: 'possession_home', awayKey: 'possession_away' },
  { label: 'Shots',             homeKey: 'shots_home',      awayKey: 'shots_away' },
  { label: 'Attacks',           homeKey: 'attacks_home',    awayKey: 'attacks_away' },
  { label: 'Dangerous Attacks', homeKey: 'dangerous_home',  awayKey: 'dangerous_away' },
];

function StatBar({ label, homeVal, awayVal, animate }) {
  const total = homeVal + awayVal;
  const homePct = total > 0 ? (homeVal / total) * 100 : 50;
  const awayPct = 100 - homePct;

  return (
    <div className="mc-stat-row">
      <div className="mc-stat-label">{label}</div>
      <div className="mc-stat-bars">
        <span className="mc-stat-val mc-stat-val--home">{homeVal}</span>
        <div className="mc-stat-track">
          <div
            className="mc-stat-fill mc-stat-fill--home"
            style={{
              width: animate ? `${homePct}%` : '0%',
              background: 'var(--home)',
              transition: animate ? 'width 0.6s cubic-bezier(0.4,0,0.2,1)' : 'none',
            }}
          />
          <div
            className="mc-stat-fill mc-stat-fill--away"
            style={{
              width: animate ? `${awayPct}%` : '0%',
              background: 'var(--away)',
              transition: animate ? 'width 0.6s cubic-bezier(0.4,0,0.2,1)' : 'none',
            }}
          />
        </div>
        <span className="mc-stat-val mc-stat-val--away">{awayVal}</span>
      </div>
    </div>
  );
}

function StatsTab({ stats }) {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    // Small delay to allow DOM paint before transition starts
    const t = setTimeout(() => setAnimate(true), 50);
    return () => clearTimeout(t);
  }, []);

  if (!stats) {
    return <div className="mc-unavailable">Stats unavailable.</div>;
  }

  // Only render rows where BOTH home and away are non-null
  const rows = STAT_DEFS.filter(
    ({ homeKey, awayKey }) => stats[homeKey] != null && stats[awayKey] != null
  );

  if (rows.length === 0) {
    return <div className="mc-unavailable">Stats unavailable.</div>;
  }

  return (
    <div className="mc-stats-tab">
      {rows.map(({ label, homeKey, awayKey }) => (
        <StatBar
          key={label}
          label={label}
          homeVal={stats[homeKey]}
          awayVal={stats[awayKey]}
          animate={animate}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main MatchCenter component
// ---------------------------------------------------------------------------
export function MatchCenter({ fixtureId, onBack }) {
  const [activeTab, setActiveTab] = useState('Summary');

  const { data, error } = usePoll(`/api/match/${fixtureId}`, 45000);

  const fixture = data?.fixture ?? null;
  const detail = data?.detail ?? {};
  const momentum = data?.momentum;
  const ageSeconds = data?.age_seconds ?? null;
  const events = detail?.events ?? [];
  const stats = detail?.stats ?? null;
  const lineups = detail?.lineups ?? null;

  return (
    <div className="mc-root">
      <MatchHeader fixture={fixture} ageSeconds={ageSeconds} error={error} onBack={onBack} />
      <TabStrip active={activeTab} onSelect={setActiveTab} />
      <div className="mc-tab-content" role="tabpanel">
        {activeTab === 'Summary' && (
          <SummaryTab momentum={momentum} events={events} fixture={fixture} />
        )}
        {activeTab === 'Lineups' && <LineupsTab lineups={lineups} />}
        {activeTab === 'Stats' && <StatsTab stats={stats} />}
      </div>
    </div>
  );
}

export default MatchCenter;
