import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from './Skeleton.jsx';

describe('Skeleton', () => {
  it('renders with the shimmer class', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild;
    expect(el.classList.contains('shimmer')).toBe(true);
  });

  it('applies numeric width as px', () => {
    const { container } = render(<Skeleton width={120} height={16} />);
    const el = container.firstChild;
    expect(el.style.width).toBe('120px');
    expect(el.style.height).toBe('16px');
  });

  it('applies string width/height directly', () => {
    const { container } = render(<Skeleton width="50%" height="2em" />);
    const el = container.firstChild;
    expect(el.style.width).toBe('50%');
    expect(el.style.height).toBe('2em');
  });

  it('applies custom radius as px when numeric', () => {
    const { container } = render(<Skeleton radius={4} />);
    const el = container.firstChild;
    expect(el.style.borderRadius).toBe('4px');
  });

  it('applies custom radius as string when provided', () => {
    const { container } = render(<Skeleton radius="50%" />);
    const el = container.firstChild;
    expect(el.style.borderRadius).toBe('50%');
  });

  it('appends extra className alongside shimmer', () => {
    const { container } = render(<Skeleton className="my-extra" />);
    const el = container.firstChild;
    expect(el.classList.contains('shimmer')).toBe(true);
    expect(el.classList.contains('my-extra')).toBe(true);
  });

  it('is aria-hidden', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild.getAttribute('aria-hidden')).toBe('true');
  });

  it('defaults to 100% width and 1em height', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild;
    expect(el.style.width).toBe('100%');
    expect(el.style.height).toBe('1em');
  });
});
