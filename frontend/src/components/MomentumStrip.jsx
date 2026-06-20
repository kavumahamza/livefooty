/**
 * MomentumStrip — diverging vertical-bar chart along the match-minute x-axis.
 *
 * Props:
 *   momentum  { mode: 'stats'|'events', buckets: [{minute, value}], caption: string }
 *             May be undefined while loading → renders skeleton.
 *
 * Bars go UP (--home) for positive values, DOWN (--away) for negative.
 * The center line sits at the vertical midpoint of the container.
 * barGeometry() handles value→height mapping (exported for unit tests from matchcenter.js).
 */
import { barGeometry } from './matchcenter.js';

const CONTAINER_HEIGHT = 120; // px total
const HALF_HEIGHT = CONTAINER_HEIGHT / 2; // 60px — max bar height

export function MomentumStrip({ momentum }) {
  // Loading / undefined guard
  if (!momentum || !Array.isArray(momentum.buckets)) {
    return (
      <div className="momentum-strip momentum-strip--loading" aria-label="Momentum loading">
        <div className="momentum-skeleton-text">momentum loading…</div>
      </div>
    );
  }

  const { buckets, caption } = momentum;

  return (
    <div className="momentum-strip" aria-label="Attack momentum">
      <div
        className="momentum-chart"
        style={{ height: `${CONTAINER_HEIGHT}px`, position: 'relative' }}
      >
        {/* Center line */}
        <div
          className="momentum-center-line"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${HALF_HEIGHT}px`,
            height: '1px',
            background: 'var(--border)',
          }}
        />

        {/* Bars */}
        <div
          className="momentum-bars"
          style={{
            display: 'flex',
            alignItems: 'center',
            height: '100%',
            gap: '1px',
          }}
        >
          {buckets.map((bucket, i) => {
            const safeValue = bucket.value ?? 0;
            const geo = barGeometry(safeValue, HALF_HEIGHT - 2);
            const isUp = geo.direction === 'up';
            const isDown = geo.direction === 'down';
            const noBar = geo.direction === 'none';

            return (
              <div
                key={bucket.minute ?? i}
                className="momentum-bar-wrapper"
                title={`${bucket.minute}' : ${safeValue > 0 ? '+' : ''}${safeValue.toFixed(2)}`}
                style={{
                  flex: 1,
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                }}
              >
                {/* Upper half (home bars grow upward) */}
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'flex-end',
                    width: '100%',
                  }}
                >
                  {isUp && !noBar && (
                    <div
                      className="momentum-bar momentum-bar--home"
                      style={{
                        width: '100%',
                        height: `${geo.heightPx}px`,
                        background: 'var(--home)',
                        borderRadius: '2px 2px 0 0',
                        minHeight: noBar ? 0 : 2,
                      }}
                    />
                  )}
                </div>
                {/* Lower half (away bars grow downward) */}
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'flex-start',
                    width: '100%',
                  }}
                >
                  {isDown && !noBar && (
                    <div
                      className="momentum-bar momentum-bar--away"
                      style={{
                        width: '100%',
                        height: `${geo.heightPx}px`,
                        background: 'var(--away)',
                        borderRadius: '0 0 2px 2px',
                        minHeight: noBar ? 0 : 2,
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Minute labels — show every 3rd bucket to avoid clutter */}
        <div
          className="momentum-minutes"
          style={{
            display: 'flex',
            gap: '1px',
            marginTop: '2px',
          }}
        >
          {buckets.map((bucket, i) => (
            <div
              key={`lbl-${bucket.minute ?? i}`}
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: '9px',
                color: 'var(--muted)',
                overflow: 'hidden',
              }}
            >
              {i % 3 === 0 ? bucket.minute : ''}
            </div>
          ))}
        </div>
      </div>

      {/* Caption — honesty UX: tells user which data mode is active */}
      {caption && (
        <div className="momentum-caption" style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center', marginTop: '4px' }}>
          {caption}
        </div>
      )}
    </div>
  );
}

export default MomentumStrip;
