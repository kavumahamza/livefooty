/**
 * Pure helpers for MatchCenter: event side assignment, icons, sorting.
 * All are exported for unit testing.
 */

/**
 * eventSide(event, home, away) → 'home'|'away'|'neutral'
 *
 * Compares event.team to the fixture home/away team names.
 */
export function eventSide(event, home, away) {
  if (!event || !event.team) return 'neutral';
  if (event.team === home) return 'home';
  if (event.team === away) return 'away';
  return 'neutral';
}

/**
 * eventIcon(event) → string (emoji)
 *
 * goal → ⚽
 * card + "Red" in detail → 🟥
 * card (default = yellow) → 🟨
 * subst → 🔁
 * unknown → •
 */
export function eventIcon(event) {
  if (!event) return '•';
  const type = (event.type || '').toLowerCase();
  const detail = event.detail || '';

  if (type === 'goal') return '⚽';
  if (type === 'card') {
    if (detail.toLowerCase().includes('red')) return '🟥';
    return '🟨';
  }
  if (type === 'subst') return '🔁';
  return '•';
}

/**
 * sortedEvents(events) → sorted copy of events by minute ascending.
 * Safe for null/undefined input.
 */
export function sortedEvents(events) {
  if (!Array.isArray(events)) return [];
  return [...events].sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
}
