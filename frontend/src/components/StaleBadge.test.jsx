import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { formatAge, StaleBadge } from './StaleBadge.jsx';

// ---------------------------------------------------------------------------
// formatAge — pure helper
// ---------------------------------------------------------------------------
describe('formatAge', () => {
  it('formats 0 seconds as "0s ago"', () => {
    expect(formatAge(0)).toBe('0s ago');
  });

  it('formats 5 seconds as "5s ago"', () => {
    expect(formatAge(5)).toBe('5s ago');
  });

  it('formats 59 seconds as "59s ago"', () => {
    expect(formatAge(59)).toBe('59s ago');
  });

  it('formats 60 seconds as "1m ago"', () => {
    expect(formatAge(60)).toBe('1m ago');
  });

  it('formats 75 seconds as "1m ago"', () => {
    expect(formatAge(75)).toBe('1m ago');
  });

  it('formats 3599 seconds as "59m ago"', () => {
    expect(formatAge(3599)).toBe('59m ago');
  });

  it('formats 3600 seconds as "1h ago"', () => {
    expect(formatAge(3600)).toBe('1h ago');
  });

  it('formats 3700 seconds as "1h ago"', () => {
    expect(formatAge(3700)).toBe('1h ago');
  });

  it('formats 7200 seconds as "2h ago"', () => {
    expect(formatAge(7200)).toBe('2h ago');
  });
});

// ---------------------------------------------------------------------------
// StaleBadge — rendered states
// ---------------------------------------------------------------------------
describe('StaleBadge', () => {
  it('shows "reconnecting…" when error is set', () => {
    render(
      <StaleBadge
        ageSeconds={null}
        error={new Error('Network error')}
        intervalMs={20000}
      />
    );
    expect(screen.getByText(/reconnecting/i)).toBeTruthy();
  });

  it('shows "live data warming up…" when ageSeconds is null and no error', () => {
    render(
      <StaleBadge
        ageSeconds={null}
        error={null}
        intervalMs={20000}
      />
    );
    expect(screen.getByText(/warming up/i)).toBeTruthy();
  });

  it('shows "updated Xs ago" when ageSeconds is provided', () => {
    render(
      <StaleBadge
        ageSeconds={10}
        error={null}
        intervalMs={20000}
      />
    );
    expect(screen.getByText(/updated 10s ago/i)).toBeTruthy();
  });

  it('shows formatted minutes when ageSeconds is 90', () => {
    render(
      <StaleBadge
        ageSeconds={90}
        error={null}
        intervalMs={20000}
      />
    );
    expect(screen.getByText(/updated 1m ago/i)).toBeTruthy();
  });

  it('error state takes priority over ageSeconds', () => {
    render(
      <StaleBadge
        ageSeconds={5}
        error={new Error('fail')}
        intervalMs={20000}
      />
    );
    expect(screen.getByText(/reconnecting/i)).toBeTruthy();
    expect(screen.queryByText(/updated/i)).toBeNull();
  });
});
