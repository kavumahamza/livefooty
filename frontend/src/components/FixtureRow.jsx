/**
 * FixtureRow — refined dense glass list-item row.
 *
 * Props:
 *   fixture   {object}    — FixtureDTO shape
 *   onSelect  {function}  — called with fixture.id on click/Enter/Space
 *
 * Layout: home (crest + name) · score+time block · away (name + crest)
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
      {/* Home team */}
      <span className="fbr-home">
        <TeamCrest name={fixture.home} logo={fixture.home_logo} size={18} />
        <span className="fbr-team-name">{fixture.home}</span>
      </span>

      {/* Central score + time block */}
      <span className="fbr-score-block">
        <span className="fbr-score tabular">
          {scoreStr(fixture.home_score, fixture.away_score, fixture.status)}
        </span>
        {live ? (
          <span className="fbr-minute">
            <span className="live-dot" aria-hidden="true" />
            <span className="fbr-minute-text">{timeLabel}</span>
          </span>
        ) : (
          <span className="fbr-kickoff">{timeLabel}</span>
        )}
      </span>

      {/* Away team */}
      <span className="fbr-away">
        <span className="fbr-team-name fbr-team-name--away">{fixture.away}</span>
        <TeamCrest name={fixture.away} logo={fixture.away_logo} size={18} />
      </span>
    </button>
  );
}

export default FixtureRow;
