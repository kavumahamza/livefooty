/**
 * competitions.js — pure helper for building the competitions navigation data.
 *
 * FEATURED_LEAGUE_IDS: ordered list of notable API-Football v3 league ids.
 * buildCompetitions(fixtures) → { featured, others }
 */

/**
 * Ordered list of featured league IDs (World Cup first).
 * FIFA World Cup, UEFA Champions League, Europa League, Conference League,
 * Premier League, La Liga, Serie A, Bundesliga, Ligue 1,
 * Euro Championship, Nations League.
 */
export const FEATURED_LEAGUE_IDS = [1, 2, 3, 848, 39, 140, 135, 78, 61, 4, 5];

const FEATURED_SET = new Set(FEATURED_LEAGUE_IDS);

/**
 * buildCompetitions — deduplicate fixtures into competition objects and split
 * into featured (ordered by FEATURED_LEAGUE_IDS position) and others (sorted
 * by country A→Z then league name A→Z).
 *
 * @param {Array|undefined} fixtures
 * @returns {{ featured: Competition[], others: Competition[] }}
 *
 * @typedef {{ league_id: number|null, league: string, country: string,
 *             league_logo: string|null, league_flag: string|null,
 *             count: number }} Competition
 */
export function buildCompetitions(fixtures) {
  if (!Array.isArray(fixtures) || fixtures.length === 0) {
    return { featured: [], others: [] };
  }

  /** @type {Map<number|string, Competition>} */
  const map = new Map();

  for (const f of fixtures) {
    // Skip fixtures without a usable league identifier
    const id = f.league_id;
    const name = f.league;
    if (id == null && !name) continue;

    // Stable map key: prefer numeric id, fall back to league name string
    const key = id != null ? id : name;

    if (map.has(key)) {
      map.get(key).count += 1;
    } else {
      map.set(key, {
        league_id: id != null ? id : null,
        league: name ?? '',
        country: f.country ?? '',
        league_logo: f.league_logo ?? null,
        league_flag: f.league_flag ?? null,
        count: 1,
      });
    }
  }

  const featured = [];
  const others = [];

  for (const comp of map.values()) {
    if (comp.league_id != null && FEATURED_SET.has(comp.league_id)) {
      featured.push(comp);
    } else {
      others.push(comp);
    }
  }

  // Sort featured by their position in FEATURED_LEAGUE_IDS (World Cup first)
  featured.sort(
    (a, b) =>
      FEATURED_LEAGUE_IDS.indexOf(a.league_id) -
      FEATURED_LEAGUE_IDS.indexOf(b.league_id)
  );

  // Sort others alphabetically: country A→Z, then league name A→Z
  others.sort((a, b) => {
    const byCountry = a.country.localeCompare(b.country, undefined, { sensitivity: 'base' });
    if (byCountry !== 0) return byCountry;
    return a.league.localeCompare(b.league, undefined, { sensitivity: 'base' });
  });

  return { featured, others };
}
