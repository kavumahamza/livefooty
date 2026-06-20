/**
 * CompetitionsNav — left sidebar on desktop (>=1024px), horizontal chip rail
 * on mobile/tablet (<1024px).
 *
 * Props:
 *   competitions      {featured: Competition[], others: Competition[]}
 *   selectedLeagueId  {number|null}  — currently active league (null = All)
 *   onSelect          {function}     — called with league_id (number) or null
 *   loading           {boolean}
 */
import { Skeleton } from './Skeleton.jsx';
import './CompetitionsNav.css';

function LogoImg({ src, alt }) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      width={16}
      height={16}
      className="cnav-logo"
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

function NavItem({ competition, isActive, onSelect }) {
  return (
    <button
      type="button"
      className={`cnav-item${isActive ? ' cnav-item--active' : ''}`}
      aria-pressed={isActive}
      onClick={() => onSelect(competition.league_id)}
    >
      <LogoImg src={competition.league_logo} alt={`${competition.league} logo`} />
      <span className="cnav-item-name">{competition.league}</span>
      <span className="cnav-item-count" aria-label={`${competition.count} matches`}>
        {competition.count}
      </span>
    </button>
  );
}

export function CompetitionsNav({ competitions, selectedLeagueId, onSelect, loading }) {
  const { featured = [], others = [] } = competitions ?? {};

  if (loading) {
    return (
      <nav className="cnav-root" aria-label="Competitions">
        <div className="cnav-skeleton-list">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} width="100%" height={36} radius="8px" />
          ))}
        </div>
      </nav>
    );
  }

  const isAllActive = selectedLeagueId == null;

  return (
    <nav className="cnav-root" aria-label="Competitions">
      {/* All matches reset */}
      <button
        type="button"
        className={`cnav-item cnav-item--all${isAllActive ? ' cnav-item--active' : ''}`}
        aria-pressed={isAllActive}
        onClick={() => onSelect(null)}
      >
        <span className="cnav-all-icon" aria-hidden="true">&#x1F30D;</span>
        <span className="cnav-item-name">All matches</span>
      </button>

      {/* Featured group */}
      {featured.length > 0 && (
        <>
          <div className="cnav-group-header" aria-hidden="true">Featured</div>
          {featured.map((comp) => (
            <NavItem
              key={comp.league_id ?? comp.league}
              competition={comp}
              isActive={comp.league_id === selectedLeagueId}
              onSelect={onSelect}
            />
          ))}
        </>
      )}

      {/* All competitions group */}
      {others.length > 0 && (
        <>
          <div className="cnav-group-header" aria-hidden="true">All Competitions</div>
          {others.map((comp) => (
            <NavItem
              key={comp.league_id ?? comp.league}
              competition={comp}
              isActive={comp.league_id === selectedLeagueId}
              onSelect={onSelect}
            />
          ))}
        </>
      )}
    </nav>
  );
}

export default CompetitionsNav;
