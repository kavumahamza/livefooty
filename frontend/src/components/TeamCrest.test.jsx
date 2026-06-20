/**
 * TeamCrest tests.
 *
 * Initials rule:
 *   - Multi-word name  → first letter of first two words, uppercase.
 *     "Manchester United" → "MU", "Real Madrid" → "RM"
 *   - Single-word name → first two characters, uppercase.
 *     "Arsenal" → "AR", "PSG" → "PS"
 *   - Empty/null      → "?"
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { initials, TeamCrest } from './TeamCrest.jsx';

// ---------------------------------------------------------------------------
// initials helper
// ---------------------------------------------------------------------------
describe('initials', () => {
  it('"Manchester United" → "MU"', () => {
    expect(initials('Manchester United')).toBe('MU');
  });

  it('"Arsenal" → "AR" (single word uses first 2 chars)', () => {
    expect(initials('Arsenal')).toBe('AR');
  });

  it('"Real Madrid" → "RM"', () => {
    expect(initials('Real Madrid')).toBe('RM');
  });

  it('"PSG" → "PS"', () => {
    expect(initials('PSG')).toBe('PS');
  });

  it('"Newcastle United" → "NU"', () => {
    expect(initials('Newcastle United')).toBe('NU');
  });

  it('null → "?"', () => {
    expect(initials(null)).toBe('?');
  });

  it('empty string → "?"', () => {
    expect(initials('')).toBe('?');
  });

  it('extra whitespace is ignored', () => {
    expect(initials('  Borussia   Dortmund  ')).toBe('BD');
  });

  it('lowercased input is uppercased', () => {
    expect(initials('inter milan')).toBe('IM');
  });
});

// ---------------------------------------------------------------------------
// TeamCrest rendering
// ---------------------------------------------------------------------------
describe('TeamCrest', () => {
  it('shows initials when logo is not provided', () => {
    render(<TeamCrest name="Arsenal" />);
    expect(screen.getByTitle('Arsenal')).toBeDefined();
    expect(screen.getByTitle('Arsenal').textContent).toBe('AR');
  });

  it('shows initials when logo is null', () => {
    render(<TeamCrest name="Manchester United" logo={null} />);
    expect(screen.getByTitle('Manchester United').textContent).toBe('MU');
  });

  it('shows initials when logo is empty string', () => {
    render(<TeamCrest name="PSG" logo="" />);
    expect(screen.getByTitle('PSG').textContent).toBe('PS');
  });

  it('renders an img when logo is provided', () => {
    render(<TeamCrest name="Chelsea" logo="https://example.com/chelsea.png" size={24} />);
    const img = screen.getByAltText('Chelsea crest');
    expect(img).toBeDefined();
    expect(img.getAttribute('src')).toBe('https://example.com/chelsea.png');
  });

  it('uses default size of 20 for the badge', () => {
    const { container } = render(<TeamCrest name="Barca" />);
    const span = container.querySelector('span');
    expect(span).toBeDefined();
    // style.width is set inline
    expect(span.style.width).toBe('20px');
  });

  it('respects custom size prop for img', () => {
    render(<TeamCrest name="Ajax" logo="https://example.com/ajax.png" size={40} />);
    const img = screen.getByAltText('Ajax crest');
    expect(img.getAttribute('width')).toBe('40');
    expect(img.getAttribute('height')).toBe('40');
  });
});
