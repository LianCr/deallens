# PriceContextChart

Shows where a dealer quote lands inside the market price distribution:
a smoothed density silhouette, the interquartile band (middle 50% of
the market), a dashed median marker, and the shopper's quote as the
loudest mark on the chart. Hovering sweeps a cursor with a live
"$X · cheaper than N% of listings" readout.

## Design decisions

- **React owns lifecycle, D3 owns math.** Scales and paths are pure
  functions in `math.ts` (unit-tested); no D3 selections, no direct DOM
  ownership fights.
- **Isomorphic by construction.** `ChartSvg` has no hooks or handlers,
  so the server renders the complete chart — visible with JavaScript
  disabled. The interactive overlay hydrates separately.
- **Interactivity is lazy and cheap.** `LazyMount` defers the overlay
  chunk until the chart scrolls into view. Pointer moves mutate only
  `transform`, `opacity`, and `textContent` through refs — no React
  re-render per move, which is what keeps the sweep at 60fps.
- **Zero CLS.** The container's `aspect-ratio` matches the SVG viewBox,
  so layout is settled before any JS arrives.
- **Honest empty state.** Below the minimum sample size the component
  renders "not enough data" instead of a made-up curve. Smoothing
  (curveBasis) is presentation only — markers and percentiles come from
  the raw buckets.

## Usage

```tsx
<PriceContextChart
  buckets={priceContext.distribution}
  quote={priceContext.quote}
  p25={priceContext.p25}
  median={priceContext.median}
  p75={priceContext.p75}
/>
```

Demo: `/dev/charts`.
