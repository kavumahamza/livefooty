/**
 * rest.js — thin fetch helpers for the football-live API.
 * All endpoints are same-origin in dev via the Vite proxy (/api → http://localhost:8000).
 */

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

/** GET /api/live — returns all currently live fixtures */
export function fetchLive() {
  return get('/api/live');
}

/**
 * GET /api/fixtures — filtered fixture list.
 * @param {Object} params - { date?: string (YYYY-MM-DD), league?: string|number, team?: string|number }
 */
export function fetchFixtures(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
  ).toString();
  return get(`/api/fixtures${qs ? `?${qs}` : ''}`);
}

/**
 * GET /api/match/<id> — single match detail (events, stats, lineups).
 * @param {string|number} id
 */
export function fetchMatch(id) {
  return get(`/api/match/${id}`);
}
