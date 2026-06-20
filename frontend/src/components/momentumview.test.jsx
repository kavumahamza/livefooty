import { describe, it, expect } from 'vitest';
import { scaleX, valueToY, buildSmoothPath } from './momentumview.js';

// ---------------------------------------------------------------------------
// scaleX
// ---------------------------------------------------------------------------
describe('scaleX', () => {
  it('minute 0 → 0', () => {
    expect(scaleX(0, 300)).toBe(0);
  });

  it('minute 90 → width', () => {
    expect(scaleX(90, 300)).toBe(300);
  });

  it('minute 45 → width/2', () => {
    expect(scaleX(45, 300)).toBeCloseTo(150);
  });

  it('minute > maxMinute is clamped to width', () => {
    expect(scaleX(120, 300)).toBe(300);
  });

  it('negative minute is clamped to 0', () => {
    expect(scaleX(-5, 300)).toBe(0);
  });

  it('custom maxMinute', () => {
    expect(scaleX(30, 300, 60)).toBeCloseTo(150);
  });

  it('null minute treated as 0', () => {
    expect(scaleX(null, 300)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// valueToY
// ---------------------------------------------------------------------------
describe('valueToY', () => {
  it('value 0 → height/2 (center)', () => {
    expect(valueToY(0, 120)).toBeCloseTo(60);
  });

  it('value 1 → ~0 (top)', () => {
    expect(valueToY(1, 120)).toBeCloseTo(0);
  });

  it('value -1 → ~height (bottom)', () => {
    expect(valueToY(-1, 120)).toBeCloseTo(120);
  });

  it('value 2 → clamped to ~0 (top)', () => {
    expect(valueToY(2, 120)).toBeCloseTo(0);
  });

  it('value -2 → clamped to ~height (bottom)', () => {
    expect(valueToY(-2, 120)).toBeCloseTo(120);
  });

  it('value 0.5 → quarter down from top', () => {
    expect(valueToY(0.5, 120)).toBeCloseTo(30);
  });

  it('value -0.5 → quarter up from bottom', () => {
    expect(valueToY(-0.5, 120)).toBeCloseTo(90);
  });

  it('null value treated as 0 → center', () => {
    expect(valueToY(null, 120)).toBeCloseTo(60);
  });
});

// ---------------------------------------------------------------------------
// buildSmoothPath
// ---------------------------------------------------------------------------
describe('buildSmoothPath', () => {
  it('0 points → empty string', () => {
    expect(buildSmoothPath([])).toBe('');
  });

  it('null input → empty string', () => {
    expect(buildSmoothPath(null)).toBe('');
  });

  it('1 point → starts with M', () => {
    const d = buildSmoothPath([{ x: 10, y: 20 }]);
    expect(d).toMatch(/^M/);
    expect(d).toBe('M 10 20');
  });

  it('2 points → starts with M, contains L', () => {
    const d = buildSmoothPath([{ x: 0, y: 60 }, { x: 300, y: 60 }]);
    expect(d).toMatch(/^M/);
    expect(d).toContain('L');
  });

  it('N points → starts with M, contains C (cubic bezier)', () => {
    const points = [
      { x: 0, y: 60 }, { x: 50, y: 40 }, { x: 100, y: 70 },
      { x: 150, y: 30 }, { x: 200, y: 80 }, { x: 250, y: 50 },
      { x: 300, y: 60 },
    ];
    const d = buildSmoothPath(points);
    expect(d).toMatch(/^M/);
    expect(d).toContain('C');
  });

  it('does not throw on a single-value flat line (all same y)', () => {
    const points = Array.from({ length: 18 }, (_, i) => ({ x: i * 16.67, y: 60 }));
    expect(() => buildSmoothPath(points)).not.toThrow();
    const d = buildSmoothPath(points);
    expect(d).toMatch(/^M/);
  });

  it('path is a non-empty string for typical 18-point input', () => {
    const points = Array.from({ length: 18 }, (_, i) => ({
      x: (i / 17) * 300,
      y: 60 + Math.sin(i) * 30,
    }));
    const d = buildSmoothPath(points);
    expect(typeof d).toBe('string');
    expect(d.length).toBeGreaterThan(0);
  });
});
