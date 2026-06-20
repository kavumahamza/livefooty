# Task V1 Report — Broadcast Night Design-System Foundation

**Status:** COMPLETE — build green, all 102 tests pass.
**Branch:** build/mvp

---

## 1. Token Palette (theme.css :root)

| Token | Value | Notes |
|---|---|---|
| `--bg` | `#07090d` | Near-black base |
| `--bg-elev` | `#0e131a` | Elevated layer |
| `--surface` | `rgba(255,255,255,0.045)` | Glass layer 1 |
| `--surface-2` | `rgba(255,255,255,0.07)` | Glass layer 2 |
| `--border` | `rgba(255,255,255,0.09)` | Glass border |
| `--text` | `#eef1f6` | Primary text |
| `--muted` | `#8a93a3` | Muted text |
| `--live` | `#b4ff2e` | Neon-lime live accent |
| `--live-glow` | `rgba(180,255,46,0.35)` | Live glow alpha |
| `--home` | `#2bd5ff` | Cool cyan (momentum home) |
| `--away` | `#ff5d73` | Warm coral (momentum away) |
| `--accent` | `#6c8cff` | General accent |
| `--shadow-card` | `0 4px 24px rgba(0,0,0,0.45)` | Card shadow |
| `--glow-live` | `0 0 0 1px var(--live), 0 0 16px var(--live-glow)` | Live glow compound |
| `--r-sm` | `8px` | Small radius |
| `--r-md` | `12px` | Medium radius |
| `--r-lg` | `18px` | Large radius |
| `--radius` | `var(--r-sm)` | Legacy alias — components that use `--radius` keep working |
| `--font-body` | `'Inter', system-ui, sans-serif` | Body font |
| `--font-display` | `'Inter', system-ui, sans-serif` | Display font |

All pre-existing variable names (`--bg`, `--surface`, `--surface-2`, `--text`, `--muted`, `--live`, `--home`, `--away`, `--border`, `--radius`) are preserved — no component CSS breaks.

---

## 2. Font Setup

- **Package installed:** `@fontsource/inter` (added to `dependencies` in package.json)
- **Imports in `main.jsx`:** weights 400, 600, 800
- **Offline-safe:** fonts bundled as woff2/woff assets in `dist/assets/` — no Google Fonts CDN call
- **Body applied:** `font-family: var(--font-body)` in theme.css body rule

---

## 3. Global Base Styles

In `theme.css`:
- `body`: background, color, font-family, font-size 14px, line-height 1.4
- Subtle radial background sheen: `radial-gradient(ellipse 80% 40% at 50% -10%, rgba(108,140,255,0.07) 0%, transparent 70%)` with `background-attachment: fixed`
- `.tabular` utility: `font-variant-numeric: tabular-nums` for scores
- `.glass` utility: glass surface with blur, border, shadow

---

## 4. Motion — Keyframes & Utility Classes

| Keyframe | Description |
|---|---|
| `@keyframes breathe` | opacity 1→0.55 + scale 1→1.35 over 1.6s, for live dot |
| `@keyframes shimmer` | background-position sweep 200% for skeleton placeholders |
| `@keyframes score-pop` | scale 1→1.18→1 + drop-shadow glow, 0.45s for score updates |

| Class | Behavior |
|---|---|
| `.live-dot` | 7px neon-lime circle, breathe animation, --live-glow shadow |
| `.shimmer` | Animated gradient sweep skeleton background |
| `.score-pop` | Brief scale+glow burst animation |

**Reduced-motion:** `@media (prefers-reduced-motion: reduce)` disables all three animations. `.shimmer` falls back to static `var(--surface-2)` background.

---

## 5. Skeleton Component API

**File:** `frontend/src/components/Skeleton.jsx`

```jsx
<Skeleton width={120} height={16} radius={4} className="my-class" />
```

| Prop | Type | Default | Notes |
|---|---|---|---|
| `width` | string \| number | `'100%'` | Number → px, string → verbatim |
| `height` | string \| number | `'1em'` | Number → px, string → verbatim |
| `radius` | string \| number | undefined (uses CSS .shimmer default `--r-sm`) | Override border-radius |
| `className` | string | `''` | Extra classes appended after `shimmer` |

Always renders `aria-hidden="true"` (decorative placeholder).

**Test file:** `Skeleton.test.jsx` — 8 tests covering shimmer class, px sizing, string sizing, custom radius (numeric and string), extra className, aria-hidden, and defaults.

---

## 6. TeamCrest Badge Polish

No code changes required. The `badgeStyle()` function in `TeamCrest.jsx` already uses:
- `background: 'var(--surface-2)'` → now resolves to `rgba(255,255,255,0.07)` (glass)
- `border: '1px solid var(--border)'` → now resolves to `rgba(255,255,255,0.09)` (glass)
- `color: 'var(--muted)'` → now `#8a93a3`

The badge automatically inherits the new glass system via token value upgrades. All 6 TeamCrest rendering tests + 9 initials tests still pass.

---

## 7. Build Output

```
dist/assets/index-Dg4o7M5o.css     18.70 kB │ gzip: 3.94 kB
dist/assets/index-MWT2OP5s.js     209.84 kB │ gzip: 65.10 kB
+ Inter font assets (woff2/woff)  ~660 kB total (lazy-loaded by browser)
✓ built in 119ms
```

JS bundle is React + app code. Font files are separate assets — not inlined — so initial JS payload is unaffected. Browsers only load the subset they need.

---

## 8. Test Output

```
Test Files  7 passed (7)
Tests       102 passed (102)
Duration    1.17s
```

New tests: 8 (Skeleton.test.jsx).
Existing tests: 94 — all green, no regressions.

---

## 9. Self-Review

- All pre-existing variable names retained — zero breakage risk.
- `--radius` legacy alias (`var(--r-sm)`) ensures any component using the old single-radius token works unchanged.
- Glass surface values use rgba — requires backdrop-filter support (Safari 9+, Chrome 76+). The `.glass` utility applies `backdrop-filter` but existing components don't yet use it; it's available for later tasks.
- `background-attachment: fixed` on body is intentional (parallax sheen) — safe, no perf concern.
- Font weight 800 imported for score display (tabular-nums + heavy weight); later tasks will apply it.
- Reduced-motion media query covers all three animation classes.

---

## 10. Concerns / Notes for Later Tasks

- **`--home` and `--away` colors changed** from the prior values (`#4f8cff` / `#ff7a59`). Any component that previously relied on those specific colors will visually shift — this is intentional per the spec. No behavioral test references these values.
- **Glass surfaces require a backdrop to blur.** `backdrop-filter: blur(10px)` only produces visible glass when there is content behind the element. Later tasks placing `.glass` cards over the body background will see the radial sheen effect. Works correctly.
- **`@fontsource/inter` bundle size:** Adds ~660 kB of font files to dist. These are split assets loaded on-demand by the browser; only Latin subsets load for most users (~55 kB woff2 per weight). Expected and acceptable per spec.
