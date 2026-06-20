import { describe, it, expect } from 'vitest';
import { eventSide, eventIcon, sortedEvents } from './matchcenter.js';

// ---------------------------------------------------------------------------
// eventSide
// ---------------------------------------------------------------------------
describe('eventSide', () => {
  const home = 'Manchester United';
  const away = 'Newcastle';

  it('returns "home" when event.team matches home', () => {
    expect(eventSide({ team: 'Manchester United' }, home, away)).toBe('home');
  });

  it('returns "away" when event.team matches away', () => {
    expect(eventSide({ team: 'Newcastle' }, home, away)).toBe('away');
  });

  it('returns "neutral" when team does not match either', () => {
    expect(eventSide({ team: 'Referee' }, home, away)).toBe('neutral');
  });

  it('returns "neutral" when event has no team', () => {
    expect(eventSide({ type: 'goal' }, home, away)).toBe('neutral');
  });

  it('returns "neutral" for null event', () => {
    expect(eventSide(null, home, away)).toBe('neutral');
  });

  it('returns "neutral" for undefined event', () => {
    expect(eventSide(undefined, home, away)).toBe('neutral');
  });
});

// ---------------------------------------------------------------------------
// eventIcon
// ---------------------------------------------------------------------------
describe('eventIcon', () => {
  it('goal → ⚽', () => {
    expect(eventIcon({ type: 'goal', detail: 'Normal Goal' })).toBe('⚽');
  });

  it('card with "Red" in detail → 🟥', () => {
    expect(eventIcon({ type: 'card', detail: 'Red Card' })).toBe('🟥');
  });

  it('card with "Yellow" in detail → 🟨', () => {
    expect(eventIcon({ type: 'card', detail: 'Yellow Card' })).toBe('🟨');
  });

  it('card with no detail (default) → 🟨', () => {
    expect(eventIcon({ type: 'card', detail: '' })).toBe('🟨');
  });

  it('subst → 🔁', () => {
    expect(eventIcon({ type: 'subst', detail: 'Substitution 1' })).toBe('🔁');
  });

  it('unknown type → •', () => {
    expect(eventIcon({ type: 'unknown', detail: '' })).toBe('•');
  });

  it('null event → •', () => {
    expect(eventIcon(null)).toBe('•');
  });

  it('case-insensitive type matching: "Goal" → ⚽', () => {
    expect(eventIcon({ type: 'Goal', detail: '' })).toBe('⚽');
  });

  it('"Red" detection is case-insensitive in detail', () => {
    expect(eventIcon({ type: 'card', detail: 'red card' })).toBe('🟥');
  });
});

// ---------------------------------------------------------------------------
// sortedEvents
// ---------------------------------------------------------------------------
describe('sortedEvents', () => {
  it('sorts events by minute ascending', () => {
    const events = [
      { minute: 45, type: 'goal' },
      { minute: 12, type: 'card' },
      { minute: 30, type: 'subst' },
    ];
    const sorted = sortedEvents(events);
    expect(sorted.map((e) => e.minute)).toEqual([12, 30, 45]);
  });

  it('does not mutate the original array', () => {
    const events = [
      { minute: 80 },
      { minute: 10 },
    ];
    const copy = [...events];
    sortedEvents(events);
    expect(events[0].minute).toBe(80); // unchanged
  });

  it('returns empty array for null input', () => {
    expect(sortedEvents(null)).toEqual([]);
  });

  it('returns empty array for undefined input', () => {
    expect(sortedEvents(undefined)).toEqual([]);
  });

  it('handles single-element array', () => {
    expect(sortedEvents([{ minute: 5 }])).toEqual([{ minute: 5 }]);
  });

  it('handles events missing minute field (treated as 0)', () => {
    const events = [{ type: 'goal' }, { minute: 10 }];
    const sorted = sortedEvents(events);
    expect(sorted[0].minute).toBeUndefined(); // null → 0 so comes first
    expect(sorted[1].minute).toBe(10);
  });

  it('stable sort: same-minute events preserve relative order', () => {
    const events = [
      { minute: 30, type: 'goal' },
      { minute: 30, type: 'card' },
    ];
    const sorted = sortedEvents(events);
    expect(sorted[0].type).toBe('goal');
    expect(sorted[1].type).toBe('card');
  });
});
