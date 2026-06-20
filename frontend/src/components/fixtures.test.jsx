import { describe, it, expect } from 'vitest';
import { isLive, formatRowTime, groupFixtures } from './fixtures.js';

// ---------------------------------------------------------------------------
// isLive
// ---------------------------------------------------------------------------
describe('isLive', () => {
  it('returns true for 1H', () => expect(isLive('1H')).toBe(true));
  it('returns true for HT', () => expect(isLive('HT')).toBe(true));
  it('returns true for 2H', () => expect(isLive('2H')).toBe(true));
  it('returns true for ET (extra time)', () => expect(isLive('ET')).toBe(true));
  it('returns true for SUSP (suspended mid-match)', () => expect(isLive('SUSP')).toBe(true));

  it('returns false for FT', () => expect(isLive('FT')).toBe(false));
  it('returns false for NS', () => expect(isLive('NS')).toBe(false));
  it('returns false for ABD', () => expect(isLive('ABD')).toBe(false));
  it('returns false for PST', () => expect(isLive('PST')).toBe(false));
  it('returns false for null', () => expect(isLive(null)).toBe(false));
  it('returns false for undefined', () => expect(isLive(undefined)).toBe(false));
});

// ---------------------------------------------------------------------------
// formatRowTime
// ---------------------------------------------------------------------------
describe('formatRowTime', () => {
  it('returns minute string for live 1H match', () => {
    expect(formatRowTime({ status: '1H', minute: 34, kickoff_utc: null })).toBe("34'");
  });

  it('returns minute string for live 2H match', () => {
    expect(formatRowTime({ status: '2H', minute: 67, kickoff_utc: null })).toBe("67'");
  });

  it('returns "HT" for halftime', () => {
    expect(formatRowTime({ status: 'HT', minute: 45, kickoff_utc: null })).toBe('HT');
  });

  it('returns "FT" for finished match', () => {
    expect(formatRowTime({ status: 'FT', minute: null, kickoff_utc: null })).toBe('FT');
  });

  it('returns "FT" for AET', () => {
    expect(formatRowTime({ status: 'AET', minute: null, kickoff_utc: null })).toBe('FT');
  });

  it('returns "ABD" for abandoned', () => {
    expect(formatRowTime({ status: 'ABD', minute: null, kickoff_utc: null })).toBe('ABD');
  });

  it('returns HH:MM (local time) for NS match with kickoff_utc', () => {
    const iso = '2026-06-20T19:45:00Z';
    const expected =
      String(new Date(iso).getHours()).padStart(2, '0') +
      ':' +
      String(new Date(iso).getMinutes()).padStart(2, '0');
    const result = formatRowTime({ status: 'NS', minute: null, kickoff_utc: iso });
    expect(result).toBe(expected);
  });

  it('returns HH:MM (local time) for NS match with non-zero hours', () => {
    const iso = '2026-06-20T08:00:00Z';
    const expected =
      String(new Date(iso).getHours()).padStart(2, '0') +
      ':' +
      String(new Date(iso).getMinutes()).padStart(2, '0');
    const result = formatRowTime({ status: 'NS', minute: null, kickoff_utc: iso });
    expect(result).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// groupFixtures
// ---------------------------------------------------------------------------
describe('groupFixtures', () => {
  const makeFix = (overrides) => ({
    id: 1,
    league: 'Premier League',
    league_id: 39,
    home: 'Arsenal',
    away: 'Chelsea',
    home_score: null,
    away_score: null,
    status: 'NS',
    minute: null,
    kickoff_utc: '2026-06-20T15:00:00Z',
    home_logo: null,
    away_logo: null,
    league_logo: null,
    league_flag: null,
    ...overrides,
  });

  it('puts live fixtures in .live', () => {
    const fixtures = [
      makeFix({ id: 1, status: '1H', minute: 22 }),
      makeFix({ id: 2, status: 'NS' }),
    ];
    const { live, leagues } = groupFixtures(fixtures);
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe(1);
    expect(leagues[0].fixtures).toHaveLength(1);
    expect(leagues[0].fixtures[0].id).toBe(2);
  });

  it('groups non-live fixtures by league_id', () => {
    const fixtures = [
      makeFix({ id: 1, league_id: 39, league: 'Premier League', status: 'FT' }),
      makeFix({ id: 2, league_id: 140, league: 'La Liga', status: 'NS' }),
      makeFix({ id: 3, league_id: 39, league: 'Premier League', status: 'FT' }),
    ];
    const { leagues } = groupFixtures(fixtures);
    expect(leagues).toHaveLength(2);
    const pl = leagues.find((l) => l.league_id === 39);
    expect(pl.fixtures).toHaveLength(2);
  });

  it('returns empty live and empty leagues for []', () => {
    const { live, leagues } = groupFixtures([]);
    expect(live).toEqual([]);
    expect(leagues).toEqual([]);
  });

  it('handles null/undefined input gracefully', () => {
    expect(groupFixtures(null)).toEqual({ live: [], leagues: [] });
    expect(groupFixtures(undefined)).toEqual({ live: [], leagues: [] });
  });

  it('puts HT fixtures in .live', () => {
    const fixtures = [makeFix({ id: 5, status: 'HT', minute: 45 })];
    const { live } = groupFixtures(fixtures);
    expect(live).toHaveLength(1);
  });

  it('preserves league insertion order', () => {
    const fixtures = [
      makeFix({ id: 1, league_id: 140, league: 'La Liga', status: 'NS' }),
      makeFix({ id: 2, league_id: 39, league: 'Premier League', status: 'NS' }),
      makeFix({ id: 3, league_id: 140, league: 'La Liga', status: 'FT' }),
    ];
    const { leagues } = groupFixtures(fixtures);
    expect(leagues[0].league_id).toBe(140);
    expect(leagues[1].league_id).toBe(39);
  });

  it('carries league_logo from first fixture in group', () => {
    const fixtures = [
      makeFix({
        id: 1,
        league_id: 39,
        league: 'Premier League',
        status: 'NS',
        league_logo: 'https://example.com/pl.png',
        league_flag: 'https://example.com/gb.svg',
      }),
      makeFix({
        id: 2,
        league_id: 39,
        league: 'Premier League',
        status: 'FT',
        league_logo: 'https://example.com/pl-other.png',
        league_flag: 'https://example.com/gb-other.svg',
      }),
    ];
    const { leagues } = groupFixtures(fixtures);
    expect(leagues).toHaveLength(1);
    // Takes from first fixture
    expect(leagues[0].league_logo).toBe('https://example.com/pl.png');
    expect(leagues[0].league_flag).toBe('https://example.com/gb.svg');
  });

  it('league_logo and league_flag are null when fixture has none', () => {
    const fixtures = [makeFix({ id: 1, status: 'NS' })];
    const { leagues } = groupFixtures(fixtures);
    expect(leagues[0].league_logo).toBeNull();
    expect(leagues[0].league_flag).toBeNull();
  });
});
