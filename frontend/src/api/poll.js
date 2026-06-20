import { useState, useEffect, useRef } from 'react';

/**
 * usePoll — fetches `url` immediately on mount, then every `intervalMs`.
 * Returns { data, lastUpdatedAt, error, loading }.
 *
 * Backoff: on error, skips one tick (doubles the effective wait once) then
 * reverts to normal cadence. Keeps the last good data on error.
 * Cleans up the interval on unmount (no setState-after-unmount).
 * Re-subscribes cleanly when url or intervalMs changes.
 */
export function usePoll(url, intervalMs) {
  const [data, setData] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // Ref so the interval callback always sees the latest url without re-registering
  const mountedRef = useRef(false);
  const skipNextRef = useRef(false); // simple one-tick backoff on error

  useEffect(() => {
    mountedRef.current = true;
    skipNextRef.current = false;

    const controller = new AbortController();

    async function doFetch() {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!mountedRef.current) return;
        setData(json);
        setLastUpdatedAt(Date.now());
        setError(null);
        setLoading(false);
        skipNextRef.current = false;
      } catch (err) {
        if (err.name === 'AbortError') return; // unmounted — ignore
        if (!mountedRef.current) return;
        setError(err);
        setLoading(false);
        // Backoff: skip the very next interval tick
        skipNextRef.current = true;
      }
    }

    // Immediate first fetch
    doFetch();

    const id = setInterval(() => {
      if (skipNextRef.current) {
        // Skip this tick (one-tick backoff after an error)
        skipNextRef.current = false;
        return;
      }
      doFetch();
    }, intervalMs);

    return () => {
      mountedRef.current = false;
      clearInterval(id);
      controller.abort();
    };
  }, [url, intervalMs]);

  return { data, lastUpdatedAt, error, loading };
}
