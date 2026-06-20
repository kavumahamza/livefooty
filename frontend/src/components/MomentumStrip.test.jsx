import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MomentumStrip } from './MomentumStrip.jsx';

describe('MomentumStrip', () => {
  it('renders without throwing when a bucket has value: null', () => {
    const momentum = {
      mode: 'stats',
      buckets: [
        { minute: 5, value: 0.3 },
        { minute: 10, value: null },
        { minute: 15, value: -0.2 },
      ],
      caption: 'Test caption',
    };

    let container;
    expect(() => {
      ({ container } = render(<MomentumStrip momentum={momentum} />));
    }).not.toThrow();

    expect(container.querySelector('.momentum-strip')).not.toBeNull();
  });
});
