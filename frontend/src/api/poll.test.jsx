import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { usePoll } from './poll.js';

// A tiny component that uses the hook and renders diagnostic output
function PollConsumer({ url, intervalMs }) {
  const { data, error, loading } = usePoll(url, intervalMs);
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="data">{data ? JSON.stringify(data) : 'null'}</span>
      <span data-testid="error">{error ? error.message : 'null'}</span>
    </div>
  );
}

describe('usePoll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Default: successful fetch returning { ok: true }
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fetches once immediately on mount', async () => {
    render(<PollConsumer url="/api/live" intervalMs={5000} />);

    // advanceTimersByTimeAsync advances fake timers AND awaits any resulting promises
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      '/api/live',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(screen.getByTestId('data').textContent).toBe('{"ok":true}');
    expect(screen.getByTestId('error').textContent).toBe('null');
  });

  it('fetches again after intervalMs elapses', async () => {
    render(<PollConsumer url="/api/live" intervalMs={5000} />);

    // Flush immediate fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    // Advance past one interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('sets error and retains prior data on a rejected fetch', async () => {
    // First call succeeds, second call rejects
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ score: 1 }),
      })
      .mockRejectedValueOnce(new Error('Network failure'));

    render(<PollConsumer url="/api/live" intervalMs={5000} />);

    // Flush immediate (successful) fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('data').textContent).toBe('{"score":1}');
    expect(screen.getByTestId('error').textContent).toBe('null');

    // Advance to trigger the second (failing) fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // error is set, prior data retained
    expect(screen.getByTestId('error').textContent).toBe('Network failure');
    expect(screen.getByTestId('data').textContent).toBe('{"score":1}');
  });

  it('stops fetching after unmount (interval is cleared)', async () => {
    const { unmount } = render(<PollConsumer url="/api/live" intervalMs={5000} />);

    // Flush immediate fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    // Unmount (synchronously clears the interval via cleanup)
    act(() => { unmount(); });

    // Advance well past the interval — should trigger NO new fetches
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });

    expect(fetch).toHaveBeenCalledTimes(1); // still only 1 — interval was cleared
  });
});
