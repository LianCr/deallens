# PriceHistoryTimeline

24 months of median asking prices with market events pinned to the
months they happened in — "why is it this price" drawn next to "what is
the price". Direct port of the author's GodModeTimeline (smart-money-
decoder, news × prediction-market odds), refactored from a 200-line
inline JSX function into an isolated, unit-tested, documented module.

## Port table

| Original (GodModeTimeline)                    | Here                                     |
| --------------------------------------------- | ---------------------------------------- |
| Price line + area, `curveMonotoneX`            | Same, direction-tinted gradient          |
| Y axis focused on data band (`pad = max(range × 0.18, …)`) | Extracted to `domain/focusDomain.ts`, unit-tested |
| Sweep cursor + header number follows           | Same; odometer `RollingNumber` port      |
| News clustered by day, count badges            | Market events clustered by month (`domain/clusterEvents.ts`) |
| Sweep near a dot (≤26 units) activates it; click pins | Same snap + pin logic (`math.ts`, unit-tested) |
| 7D / 30D / All range switch                    | 6M / 12M / 24M                           |
| Honest thin-data empty state                   | "Not enough price history to draw an honest chart" |
| —                                              | **New:** SSR static skeleton, upgraded in place on hydration |

## Design decisions

- **One SVG, two lives.** `TimelineSvg` is a pure function with no
  hooks or handlers. The server renders it as a complete static chart
  (readable with JavaScript disabled); the interactive client renders
  the same component with a live cursor. There is no second rendering
  path to drift out of sync.
- **In-place upgrade, zero CLS.** `TimelineUpgrade` swaps the skeleton
  for the interactive version when it scrolls into view. Both layouts
  come from the same math and fixed-height header/readout, so the swap
  is invisible — and the interactive chunk stays off the critical path.
- **Interaction state is the snapped month index**, not the raw pointer.
  Monthly data has at most 24 cursor states, so a full sweep costs a
  bounded handful of renders; identical-index moves bail out in
  setState. (The original re-rendered per mousemove; snapping to the
  data's own granularity is both cheaper and more honest.)
- **The readout bar is fixed-height below the chart** — event details
  never cover the price line, and pinning means the story survives the
  pointer leaving. Its footer says what it is: correlated in time,
  not causal, demo dataset.

Demo: `/dev/charts`.
