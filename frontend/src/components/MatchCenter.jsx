/**
 * MatchCenter — SofaScore-style full-page tabbed match detail.
 *
 * Props:
 *   fixtureId  {number|string}  — the fixture to display
 *   onBack     {function}       — called when the user presses Back
 *
 * Polls /api/match/<fixtureId> every 45s via usePoll.
 * Tabs: Summary · Lineups · Stats
 */
import { useState } from 'react';
import { usePoll } from '../api/poll.js';
import { StaleBadge } from './StaleBadge.jsx';
import { MomentumStrip } from './MomentumStrip.jsx';
import { TeamCrest } from './TeamCrest.jsx';
import { isLive } from './fixtures.js';
import { eventSide, eventIcon, sortedEvents } from './matchcenter.js';
import './MatchCenter.css';

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
function MatchHeader({ fixture, ageSeconds, error, onBack }) {
  if (!fixture) {
    return (
      <div className="mc-header">
        <button className="mc-back-btn" onClick={onBack} type="button" aria-label="Back">
          ← Back
        </button>
        <div className="mc-loading">Loading match…</div>
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

  return (
    <div className="mc-header">
      <button className="mc-back-btn" onClick={onBack} type="button" aria-label="Back">
        ← Back
      </button>

      <div className="mc-scoreline">
        <span className="mc-team mc-team--home">
          <TeamCrest name={fixture.home} logo={fixture.home_logo} size={40} />
          {fixture.home}
        </span>
        <div className="mc-score-block">
          <span className="mc-score">
            {fixture.home_score ?? '–'}&nbsp;–&nbsp;{fixture.away_score ?? '–'}
          </span>
          <span
            className="mc-minute"
            style={{ color: live ? 'var(--live)' : 'var(--muted)' }}
          >
            {minuteDisplay}
          </span>
        </div>
        <span className="mc-team mc-team--away">
          <TeamCrest name={fixture.away} logo={fixture.away_logo} size={40} />
          {fixture.away}
        </span>
      </div>

      <div className="mc-header-meta">
        {fixture.league && (
          <span className="mc-league">{fixture.league}</span>
        )}
        <StaleBadge ageSeconds={ageSeconds} error={error} intervalMs={45000} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab strip
// ---------------------------------------------------------------------------
const TABS = ['Summary', 'Lineups', 'Stats'];

function TabStrip({ active, onSelect }) {
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary tab — MomentumStrip + event timeline
// ---------------------------------------------------------------------------
function EventRow({ event, fixture }) {
  const side = eventSide(event, fixture?.home, fixture?.away);
  const icon = eventIcon(event);

  const minuteLabel = `${event.minute}'`;
  const playerLabel = event.player || '';
  const assistLabel = event.type === 'goal' && event.assist ? `assist: ${event.assist}` : '';

  if (side === 'home') {
    return (
      <div className="mc-event mc-event--home">
        <div className="mc-event-content mc-event-content--home">
          <span className="mc-event-icon">{icon}</span>
          <span className="mc-event-player">{playerLabel}</span>
          {assistLabel && <span className="mc-event-assist">{assistLabel}</span>}
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
          <span className="mc-event-icon">{icon}</span>
          <span className="mc-event-player">{playerLabel}</span>
          {assistLabel && <span className="mc-event-assist">{assistLabel}</span>}
        </div>
      </div>
    );
  }

  // neutral / unknown team
  return (
    <div className="mc-event mc-event--neutral">
      <div className="mc-event-content mc-event-content--home" />
      <div className="mc-event-spine">
        <span className="mc-event-minute">{minuteLabel}</span>
        <span className="mc-event-icon">{icon}</span>
        <span className="mc-event-player">{playerLabel}</span>
      </div>
      <div className="mc-event-content mc-event-content--away" />
    </div>
  );
}

function SummaryTab({ momentum, events, fixture }) {
  const sorted = sortedEvents(events);

  return (
    <div className="mc-summary-tab">
      <MomentumStrip momentum={momentum} />

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
// Lineups tab
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
        <div className="mc-lineup-col">
          <div className="mc-lineup-col-header">Home XI</div>
          <ol className="mc-lineup-list">
            {homeList.map((p, i) => (
              <li key={i} className="mc-lineup-player">{extractName(p)}</li>
            ))}
          </ol>
        </div>
        <div className="mc-lineup-col">
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
// Stats tab
// ---------------------------------------------------------------------------
const STAT_DEFS = [
  { label: 'Possession %',      homeKey: 'possession_home', awayKey: 'possession_away' },
  { label: 'Shots',             homeKey: 'shots_home',      awayKey: 'shots_away' },
  { label: 'Attacks',           homeKey: 'attacks_home',    awayKey: 'attacks_away' },
  { label: 'Dangerous Attacks', homeKey: 'dangerous_home',  awayKey: 'dangerous_away' },
];

function StatBar({ label, homeVal, awayVal }) {
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
            style={{ width: `${homePct}%`, background: 'var(--home)' }}
          />
          <div
            className="mc-stat-fill mc-stat-fill--away"
            style={{ width: `${awayPct}%`, background: 'var(--away)' }}
          />
        </div>
        <span className="mc-stat-val mc-stat-val--away">{awayVal}</span>
      </div>
    </div>
  );
}

function StatsTab({ stats }) {
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
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
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
      <MatchHeader
        fixture={fixture}
        ageSeconds={ageSeconds}
        error={error}
        onBack={onBack}
      />

      <TabStrip active={activeTab} onSelect={setActiveTab} />

      <div className="mc-tab-content" role="tabpanel">
        {activeTab === 'Summary' && (
          <SummaryTab momentum={momentum} events={events} fixture={fixture} />
        )}
        {activeTab === 'Lineups' && (
          <LineupsTab lineups={lineups} />
        )}
        {activeTab === 'Stats' && (
          <StatsTab stats={stats} />
        )}
      </div>
    </div>
  );
}

export default MatchCenter;
