/**
 * FixtureRow — reusable dense fixture row.
 *
 * Props:
 *   fixture   {object}    — FixtureDTO shape
 *   onSelect  {function}  — called with fixture.id on click/Enter/Space
 *
 * Layout: time · home · score · away · live-dot
 * Uses CSS classes from FixturesBrowser.css so the visual is identical
 * whether rendered inside FixturesBrowser or LiveScoreList.
 */
import { isLive, formatRowTime } from './fixtures.js';
import { TeamCrest } from './TeamCrest.jsx';

function scoreStr(home, away, status) {
  if (home == null || away == null) {
    if (status === 'NS' || status === 'TBD') return '– : –';
    return '? : ?';
  }
  return `${home} : ${away}`;
}

function LiveDot() {
  return <span className="fbr-live-dot" aria-hidden="true" title="Live" />;
}

export function FixtureRow({ fixture, onSelect }) {
  const live = isLive(fixture.status);
  const timeLabel = formatRowTime(fixture);

  return (
    <button
      className={`fbr-row${live ? ' fbr-row--live' : ''}`}
      onClick={() => onSelect?.(fixture.id)}
      aria-label={`${fixture.home} vs ${fixture.away}, ${timeLabel}`}
      type="button"
    >
      <span className={`fbr-time${live ? ' fbr-time--live' : ''}`}>
        {timeLabel}
      </span>
      <span className="fbr-home">
        <TeamCrest name={fixture.home} logo={fixture.home_logo} size={18} />
        {fixture.home}
      </span>
      <span className="fbr-score">
        {scoreStr(fixture.home_score, fixture.away_score, fixture.status)}
      </span>
      <span className="fbr-away">
        <TeamCrest name={fixture.away} logo={fixture.away_logo} size={18} />
        {fixture.away}
      </span>
      {live && <LiveDot />}
    </button>
  );
}

export default FixtureRow;
