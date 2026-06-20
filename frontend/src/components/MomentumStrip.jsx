/**
 * MomentumStrip — cinematic SVG "pressure wave" area chart.
 *
 * Props:
 *   momentum   { mode: 'stats'|'events', buckets: [{minute, value}], caption }
 *              Undefined while loading → shimmer skeleton.
 *   events     [{minute, type, team, detail}]  optional — goal/card/subst markers.
 *   homeTeam   string | null
 *   awayTeam   string | null
 *
 * value > 0 = home pressure (cyan, rises above center).
 * value < 0 = away pressure (coral, falls below center).
 */
import { useMemo, useRef, useEffect, useState } from 'react';
import { Skeleton } from './Skeleton.jsx';
import { scaleX, valueToY, buildSmoothPath } from './momentumview.js';

// ── SVG viewport constants ──────────────────────────────────────────────────
const VW = 300;
const VH = 120;
const CY = VH / 2;          // center-line y
const MAX_MINUTE = 90;
// Small top/bottom padding so wave doesn't clip at edge
const PAD_Y = 6;
const WAVE_HEIGHT = VH - PAD_Y * 2; // usable height for wave amplitude

// ── Marker sizes ────────────────────────────────────────────────────────────
const GOAL_R = 5;       // goal circle radius
const CARD_W = 7;
const CARD_H = 9;
const SUBST_R = 3;

// ── Animation duration (ms) ─────────────────────────────────────────────────
const DRAW_DURATION = 900;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Convert bucket value to SVG y, accounting for padding. */
function bucketToY(value) {
  const clamped = Math.max(-1, Math.min(1, value ?? 0));
  // Map [-1,1] into [PAD_Y, VH-PAD_Y] with 0→CY, 1→PAD_Y, -1→VH-PAD_Y
  return CY - clamped * (WAVE_HEIGHT / 2);
}

/** Build closed SVG path for a filled area.
 *  `side` = 'home' → clip to y ≤ CY (above center); 'away' → y ≥ CY (below).
 *  The closed path goes: curve → right-bottom corner → left-bottom corner → back.
 */
function buildAreaPath(points, side) {
  if (!points || points.length === 0) return '';

  // Build the main curve, but for the area fill we need to:
  // 1. Clamp each point's y to stay on the correct side of the center line.
  // 2. Close back to the baseline (CY) at both ends.
  const areaPoints = points.map((p) => ({
    x: p.x,
    y: side === 'home'
      ? Math.min(CY, p.y)   // home = above center, y decreases
      : Math.max(CY, p.y),  // away = below center, y increases
  }));

  const curvePath = buildSmoothPath(areaPoints);
  if (!curvePath) return '';

  const firstX = areaPoints[0].x;
  const lastX = areaPoints[areaPoints.length - 1].x;

  // Close the area back along the baseline
  return `${curvePath} L ${lastX} ${CY} L ${firstX} ${CY} Z`;
}

/** Build the stroke-only path for the actual wave (unclamped). */
function buildWavePath(points) {
  return buildSmoothPath(points);
}

// ── Event marker sub-components ─────────────────────────────────────────────

function GoalMarker({ cx, cy }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={GOAL_R + 2} fill="none" stroke="var(--live)" strokeWidth="1" opacity="0.5" />
      <circle cx={cx} cy={cy} r={GOAL_R} fill="var(--live)" />
    </g>
  );
}

function CardMarker({ cx, cy, isRed }) {
  return (
    <rect
      x={cx - CARD_W / 2}
      y={cy - CARD_H / 2}
      width={CARD_W}
      height={CARD_H}
      rx="1.5"
      fill={isRed ? '#ff4d4d' : '#ffd23f'}
    />
  );
}

function SubstMarker({ cx, cy }) {
  return <circle cx={cx} cy={cy} r={SUBST_R} fill="var(--muted)" opacity="0.7" />;
}

// ── Main component ───────────────────────────────────────────────────────────

export function MomentumStrip({
  momentum,
  events = [],
  homeTeam = null,
  awayTeam = null,
}) {
  // Loading / invalid guard
  if (!momentum || !Array.isArray(momentum.buckets)) {
    return (
      <div className="momentum-strip momentum-strip--loading" aria-label="Momentum loading">
        <Skeleton width="100%" height={120} radius="var(--r-sm)" />
        <div
          style={{
            fontSize: '11px',
            color: 'var(--muted)',
            textAlign: 'center',
            marginTop: '6px',
          }}
        >
          momentum loading…
        </div>
      </div>
    );
  }

  const { buckets, caption, mode } = momentum;

  // ── Geometry ──────────────────────────────────────────────────────────────

  const wavePoints = useMemo(() => {
    return buckets.map((b) => ({
      x: scaleX(b.minute ?? 0, VW, MAX_MINUTE),
      y: bucketToY(b.value),
    }));
  }, [buckets]);

  const wavePath = useMemo(() => buildWavePath(wavePoints), [wavePoints]);
  const homeAreaPath = useMemo(() => buildAreaPath(wavePoints, 'home'), [wavePoints]);
  const awayAreaPath = useMemo(() => buildAreaPath(wavePoints, 'away'), [wavePoints]);

  // ── Draw-in animation ─────────────────────────────────────────────────────
  // We animate stroke-dashoffset from full length → 0, then fade in fills.

  const strokeRef = useRef(null);
  const [pathLength, setPathLength] = useState(0);
  const [fillOpacity, setFillOpacity] = useState(0);
  const prefersReduced = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    if (prefersReduced.current) {
      setFillOpacity(1);
      return;
    }
    const el = strokeRef.current;
    if (!el) return;

    const len = el.getTotalLength?.() || 0;
    setPathLength(len);

    // Draw stroke
    el.style.strokeDasharray = `${len}`;
    el.style.strokeDashoffset = `${len}`;
    el.style.transition = `stroke-dashoffset ${DRAW_DURATION}ms cubic-bezier(0.4,0,0.2,1)`;

    // Trigger animation via rAF
    const raf = requestAnimationFrame(() => {
      el.style.strokeDashoffset = '0';
    });

    // Fade fills in halfway through
    const timer = setTimeout(() => {
      setFillOpacity(1);
    }, DRAW_DURATION * 0.5);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [wavePath]);

  // ── Event marker positions ────────────────────────────────────────────────
  const eventMarkers = useMemo(() => {
    if (!Array.isArray(events) || events.length === 0) return [];
    return events.map((ev, i) => {
      const minute = ev.minute ?? 0;
      const mx = scaleX(minute, VW, MAX_MINUTE);

      // Find nearest bucket's y to place marker on/near the curve
      const nearestBucket = buckets.reduce((best, b) => {
        return Math.abs((b.minute ?? 0) - minute) < Math.abs((best.minute ?? 0) - minute)
          ? b
          : best;
      }, buckets[0] ?? { minute: 0, value: 0 });

      const curveY = bucketToY(nearestBucket?.value ?? 0);

      // For goals: place slightly above the curve (or above center if home side)
      // For cards/subst: place near top edge
      const type = (ev.type || '').toLowerCase();
      const isGoal = type === 'goal';
      const isCard = type === 'card';
      const isSubst = type === 'subst';
      const isRed = isCard && (ev.detail || '').toLowerCase().includes('red');

      // Broadcaster convention: goal dots sit ON the curve
      // Cards/subst markers float near the top edge
      let my;
      if (isGoal) {
        my = Math.min(curveY, CY - 8); // on curve, but nudge slightly off center
      } else {
        my = PAD_Y + 6; // near top
      }

      return { key: `${minute}-${type}-${i}`, mx, my, type, isGoal, isCard, isSubst, isRed, ev };
    });
  }, [events, buckets]);

  // ── Render ────────────────────────────────────────────────────────────────

  const fillTransition = prefersReduced.current
    ? 'none'
    : `opacity ${DRAW_DURATION * 0.5}ms ease ${DRAW_DURATION * 0.5}ms`;

  return (
    <div className="momentum-strip" aria-label="Attack momentum">
      {/* Responsive container: fixed height, SVG scales horizontally */}
      <div style={{ width: '100%', height: `${VH}px`, position: 'relative' }}>
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          width="100%"
          height="100%"
          preserveAspectRatio="none"
          aria-hidden="true"
          style={{ display: 'block', overflow: 'visible' }}
        >
          <defs>
            {/* Home area gradient: cyan fading to transparent at center */}
            <linearGradient id="grad-home" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2bd5ff" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#2bd5ff" stopOpacity="0.04" />
            </linearGradient>

            {/* Away area gradient: coral fading to transparent at center */}
            <linearGradient id="grad-away" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#ff5d73" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#ff5d73" stopOpacity="0.04" />
            </linearGradient>

            {/* Subtle glow filter for the stroke */}
            <filter id="wave-glow" x="-5%" y="-40%" width="110%" height="180%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Clip path to prevent area fill overflowing SVG */}
            <clipPath id="wave-clip">
              <rect x="0" y="0" width={VW} height={VH} />
            </clipPath>
          </defs>

          {/* ── Filled areas ── */}
          <g
            clipPath="url(#wave-clip)"
            style={{
              opacity: fillOpacity,
              transition: fillTransition,
            }}
          >
            {/* Home pressure — above center */}
            {homeAreaPath && (
              <path
                d={homeAreaPath}
                fill="url(#grad-home)"
                strokeWidth="0"
              />
            )}
            {/* Away pressure — below center */}
            {awayAreaPath && (
              <path
                d={awayAreaPath}
                fill="url(#grad-away)"
                strokeWidth="0"
              />
            )}
          </g>

          {/* ── Baseline ── */}
          <line
            x1="0"
            y1={CY}
            x2={VW}
            y2={CY}
            stroke="rgba(255,255,255,0.09)"
            strokeWidth="0.75"
          />

          {/* ── Wave stroke ── */}
          {wavePath && (
            <path
              ref={strokeRef}
              d={wavePath}
              fill="none"
              stroke="rgba(255,255,255,0.55)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#wave-glow)"
            />
          )}

          {/* ── Event markers (rendered in a non-scaled layer) ── */}
          {eventMarkers.map(({ key, mx, my, isGoal, isCard, isSubst, isRed, ev }) => (
            <g key={key} style={{ cursor: 'default' }}>
              <title>{`${ev.minute ?? '?'}' — ${ev.type}${ev.detail ? ` (${ev.detail})` : ''}${ev.team ? ` · ${ev.team}` : ''}`}</title>
              {isGoal && <GoalMarker cx={mx} cy={my} />}
              {isCard && <CardMarker cx={mx} cy={my} isRed={isRed} />}
              {isSubst && <SubstMarker cx={mx} cy={my} />}
            </g>
          ))}
        </svg>
      </div>

      {/* ── Caption + mode pill ── */}
      {caption && (
        <div
          className="momentum-caption"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontSize: '11px',
            color: 'var(--muted)',
            marginTop: '5px',
          }}
        >
          <span>{caption}</span>
          {mode && (
            <span
              style={{
                fontSize: '9px',
                padding: '1px 5px',
                borderRadius: '99px',
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'var(--muted)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              {mode}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default MomentumStrip;
