/**
 * TeamCrest — reusable team badge component.
 *
 * Props:
 *   name   {string}  — team name used to generate initials fallback
 *   logo   {string|null|undefined}  — URL of the team logo image
 *   size   {number}  — width/height in px (default 20)
 *
 * Behavior:
 *   - When `logo` is provided: renders a rounded <img>. If the image fails
 *     to load (onError), falls back to the initials badge.
 *   - When `logo` is falsy OR image errors: shows a circular badge with
 *     initials on a muted background — never a broken-image icon.
 *
 * Initials rule (see exported `initials` helper):
 *   - Split name on whitespace, take first letter of up to the first two
 *     words, uppercase. Single-word name → first two letters uppercase.
 *   - Examples: "Manchester United" → "MU", "Arsenal" → "AR", "PSG" → "PS"
 */
import { useState } from 'react';

/**
 * Derive initials from a team name.
 * Rule: first letter of up to 2 words (split by whitespace), uppercased.
 * If there is only 1 word, use its first 2 letters.
 * @param {string} name
 * @returns {string}
 */
export function initials(name) {
  if (!name) return '?';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  // Single word — first 2 chars
  return words[0].slice(0, 2).toUpperCase();
}

const imgStyle = (size) => ({
  width: size,
  height: size,
  borderRadius: '50%',
  objectFit: 'contain',
  flexShrink: 0,
  display: 'inline-block',
  verticalAlign: 'middle',
});

const badgeStyle = (size) => ({
  width: size,
  height: size,
  borderRadius: '50%',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  color: 'var(--muted)',
  fontSize: Math.max(8, Math.round(size * 0.38)),
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  verticalAlign: 'middle',
  lineHeight: 1,
  userSelect: 'none',
});

export function TeamCrest({ name, logo, size = 20 }) {
  const [imgError, setImgError] = useState(false);
  const showBadge = !logo || imgError;

  if (showBadge) {
    return (
      <span style={badgeStyle(size)} aria-hidden="true" title={name}>
        {initials(name)}
      </span>
    );
  }

  return (
    <img
      src={logo}
      alt={name ? `${name} crest` : 'team crest'}
      width={size}
      height={size}
      style={imgStyle(size)}
      onError={() => setImgError(true)}
    />
  );
}

export default TeamCrest;
