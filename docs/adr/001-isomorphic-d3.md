# ADR 001 — Isomorphic D3: server-rendered charts, lazily hydrated

## Status

Accepted.

## Context

The two signature visualizations (market distribution, price history)
are D3-driven. The default pattern — a client component that draws into
a `<div>` after mount — has three costs: nothing renders without
JavaScript, the chart pops in after hydration (layout shift), and the
D3 code rides the critical JS path of every page view.

## Decision

Split every chart into three parts:

1. **Math** (`math.ts`): pure functions over d3-scale/shape/array.
   No DOM, no React. Runs identically on server and client; unit-tested.
2. **SVG** (`ChartSvg.tsx` / `TimelineSvg.tsx`): a pure presentational
   component — props in, SVG out, no hooks, no handlers. Server
   components render it as complete, correct markup.
3. **Interactivity**: a client layer that mounts only when the chart
   scrolls into view (IntersectionObserver + `lazy()`), either as a
   transparent overlay (distribution chart) or as an in-place swap that
   re-renders the same SVG component with live cursor state (timeline).

Pointer-driven animation mutates only `transform`, `opacity`, and
`textContent` through refs — never layout properties, never a React
re-render per pointer event.

## Consequences

- Every chart is visible — with real data — when JavaScript is off.
  The Playwright `chromium-no-js` project enforces this permanently.
- Zero CLS: containers carry the SVG's aspect ratio; skeleton and
  interactive versions share one layout because they share one
  rendering path.
- The D3-flavored chunks stay off the critical path: the deal page
  loads ~48 KB gzip of JS; budgets are asserted in CI.
- Cost: the interactive timeline re-renders from the same shape math
  the server used. Acceptable — the math is microseconds; the wire
  savings and the no-JS guarantee are worth far more.
