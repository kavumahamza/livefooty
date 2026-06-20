import { describe, it, expect } from 'vitest';
import { buildCompetitions, FEATURED_LEAGUE_IDS } from './competitions.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFixture(overrides = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    league_id: 39,
    league: 'Premier League',
    country: 'England',
    league_logo: null,
    league_flag: null,
    status: 'NS',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildCompetitions', () => {
  it('returns empty featured and others for undefined input', () => {
    expect(buildCompetitions(undefined)).toEqual({ featured: [], others: [] });
  });

  it('returns empty for empty array', () => {
    expect(buildCompetitions([])).toEqual({ featured: [], others: [] });
  });

  it('deduplicates: 3 fixtures same league → 1 competition, count 3', () => {
    const fixtures = [
      makeFixture({ league_id: 39, league: 'Premier League', country: 'England' }),
      makeFixture({ league_id: 39, league: 'Premier League', country: 'England' }),
      makeFixture({ league_id: 39, league: 'Premier League', country: 'England' }),
    ];
    const { featured, others } = buildCompetitions(fixtures);
    // PL (39) is featured
    expect(featured).toHaveLength(1);
    expect(others).toHaveLength(0);
    expect(featured[0].count).toBe(3);
    expect(featured[0].league_id).toBe(39);
    expect(featured[0].league).toBe('Premier League');
  });

  it('featured ordering: World Cup (1) before PL (39) before La Liga (140)', () => {
    // Provide fixtures in wrong order — output should follow FEATURED_LEAGUE_IDS position
    const fixtures = [
      makeFixture({ league_id: 140, league: 'La Liga', country: 'Spain' }),
      makeFixture({ league_id: 39, league: 'Premier League', country: 'England' }),
      makeFixture({ league_id: 1, league: 'FIFA World Cup', country: 'World' }),
    ];
    const { featured } = buildCompetitions(fixtures);
    expect(featured.map((c) => c.league_id)).toEqual([1, 39, 140]);
  });

  it('non-featured league goes to others, not featured', () => {
    const fixtures = [
      makeFixture({ league_id: 999, league: 'Obscure League', country: 'Zland' }),
    ];
    const { featured, others } = buildCompetitions(fixtures);
    expect(featured).toHaveLength(0);
    expect(others).toHaveLength(1);
    expect(others[0].league_id).toBe(999);
  });

  it('others sorted by country A→Z then league name A→Z', () => {
    const fixtures = [
      makeFixture({ league_id: 200, league: 'Z League', country: 'Brazil' }),
      makeFixture({ league_id: 201, league: 'A League', country: 'Brazil' }),
      makeFixture({ league_id: 202, league: 'M League', country: 'Argentina' }),
    ];
    const { others } = buildCompetitions(fixtures);
    // Argentina < Brazil, so M League first; within Brazil: A League < Z League
    expect(others.map((c) => c.league_id)).toEqual([202, 201, 200]);
  });

  it('only leagues present in data appear in featured', () => {
    // Only PL (39) is in data — Champions League (2) and World Cup (1) are not
    const fixtures = [
      makeFixture({ league_id: 39, league: 'Premier League', country: 'England' }),
    ];
    const { featured } = buildCompetitions(fixtures);
    expect(featured).toHaveLength(1);
    expect(featured[0].league_id).toBe(39);
  });

  it('skips fixtures missing both league_id and league name', () => {
    const fixtures = [
      { id: 'x', league_id: null, league: null, status: 'NS' },
      makeFixture({ league_id: 39, league: 'Premier League', country: 'England' }),
    ];
    const { featured, others } = buildCompetitions(fixtures);
    expect(featured).toHaveLength(1);
    expect(others).toHaveLength(0);
  });

  it('skips fixtures with null league_id — they appear in neither featured nor others', () => {
    const fixtures = [
      { id: 'a', league_id: null, league: 'Local Cup', country: 'Uganda', status: 'NS',
        league_logo: null, league_flag: null },
      { id: 'b', league_id: undefined, league: 'Local Cup', country: 'Uganda', status: 'NS',
        league_logo: null, league_flag: null },
      makeFixture({ league_id: 39, league: 'Premier League', country: 'England' }),
    ];
    const { featured, others } = buildCompetitions(fixtures);
    // Only the numeric-id fixture appears; null/undefined-id fixtures are skipped entirely
    expect(featured).toHaveLength(1);
    expect(featured[0].league_id).toBe(39);
    expect(others).toHaveLength(0);
  });

  it('FEATURED_LEAGUE_IDS has World Cup (1) as first entry', () => {
    expect(FEATURED_LEAGUE_IDS[0]).toBe(1);
  });
});
