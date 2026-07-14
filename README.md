# DealLens — Is this price fair?

An isomorphic React (Next.js App Router) demo that reframes car pricing as
**context, not a number**: pick a real vehicle (NHTSA data), enter a dealer
quote, and see where it lands in the market distribution, how prices moved
over the last 24 months, and which market events sit next to those moves.

> 🚧 Work in progress — built milestone by milestone. The full README
> (architecture, GraphQL schema design notes, Core Web Vitals evidence,
> data-honesty methodology) lands with the final milestone.

## Principles

- **Isomorphic first** — every page server-renders its core conclusion;
  the app is usable with JavaScript disabled (enforced by a dedicated
  Playwright project).
- **Performance is a feature** — Lighthouse CI budgets are hard build
  gates: Performance ≥ 95, LCP < 2.5 s, CLS < 0.1, TBT < 200 ms.
- **Data honesty** — real API data (NHTSA vPIC, fueleconomy.gov) is
  unlabeled; the synthetic pricing dataset is labeled "Demo pricing data"
  everywhere it appears, down to a `REAL | DEMO` tag in the GraphQL type
  system. Missing data gets an honest empty state, never interpolation.

## Getting started

```bash
npm install
npm run dev
```

No API keys required — all upstream data sources are free public APIs.

## Scripts

| Command             | What it does                            |
| ------------------- | --------------------------------------- |
| `npm run dev`       | Dev server                              |
| `npm run build`     | Production build                        |
| `npm test`          | Unit + contract tests (Vitest)          |
| `npm run test:e2e`  | Playwright E2E (3 browsers + no-JS run) |
| `npm run lint`      | ESLint                                  |
| `npm run typecheck` | TypeScript, strict mode                 |
