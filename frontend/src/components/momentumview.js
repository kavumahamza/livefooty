/**
 * momentumview.js — Pure geometry helpers for the MomentumStrip SVG pressure-wave chart.
 * All functions are stateless and side-effect-free; exported for unit testing.
 */

/**
 * scaleX(minute, width, maxMinute=90) → x coordinate in [0, width]
 *
 * Maps a match minute to an SVG x coordinate.
 * minute is clamped to [0, maxMinute].
 */
export function scaleX(minute, width, maxMinute = 90) {
  const safeMin = Math.max(0, Math.min(maxMinute, minute ?? 0));
  if (maxMinute === 0) return 0;
  return (safeMin / maxMinute) * width;
}

/**
 * valueToY(value, height) → y coordinate
 *
 * value  0 → center (height/2)
 * value  1 → ~0 (top, home pressure)
 * value -1 → ~height (bottom, away pressure)
 * |value| > 1 is clamped.
 */
export function valueToY(value, height) {
  const clamped = Math.max(-1, Math.min(1, value ?? 0));
  return height / 2 - clamped * (height / 2);
}

/**
 * buildSmoothPath(points) → SVG path `d` string
 *
 * Converts an array of {x, y} points into a smooth cubic Bézier path using
 * Catmull-Rom → cubic Bézier conversion (alpha=0.5, tension=0).
 *
 * Handles:
 *   0 points → ""
 *   1 point  → "M x y"
 *   2 points → "M x1 y1 L x2 y2"
 *   N points → smooth Catmull-Rom curve
 */
export function buildSmoothPath(points) {
  if (!Array.isArray(points) || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  // Catmull-Rom to cubic Bézier conversion
  // We duplicate first and last points to handle endpoints naturally
  const pts = [points[0], ...points, points[points.length - 1]];
  const tension = 0.4; // lower = less overshoot; 0.5 = classic Catmull-Rom

  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;

  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2];

    // Control points derived from Catmull-Rom formula
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${fmt(cp1x)} ${fmt(cp1y)}, ${fmt(cp2x)} ${fmt(cp2y)}, ${fmt(p2.x)} ${fmt(p2.y)}`;
  }

  return d;
}

/** Format a number to at most 3 decimal places, stripping trailing zeros. */
function fmt(n) {
  return parseFloat(n.toFixed(3));
}
