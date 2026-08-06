# DealLens — Is this actually a good deal?

**Evidence-backed price intelligence for high-consideration purchases,
starting with used cars.** Research the market, compare citable offers,
see the deterministic math, then get an AI recommendation that is only
allowed to narrate that evidence.

> **Live demo:** [deallens-xi.vercel.app](https://deallens-xi.vercel.app) ·
> **Listing analyzer:** [/research](https://deallens-xi.vercel.app/research) ·
> **Shareable deal dashboard:** [Honda Civic example](https://deallens-xi.vercel.app/deal/honda/2022/civic?quote=24500) ·
> **GraphQL:** [/api/graphql](https://deallens-xi.vercel.app/api/graphql)

![30-second walkthrough](docs/demo.gif)

## What this is (and is not)

| DealLens is | DealLens is not |
| ----------- | --------------- |
| An evidence-backed research + price intelligence assistant | A car marketplace or dealer inventory site |
| Used cars as the first complete vertical | “Search anything on the entire internet” |
| Controlled listing search (SerpAPI) + honest DEMO fallback | Unauthorized scraping |
| “AI narrates, math decides” | An LLM that invents prices or listings |

## Product surfaces

1. **Listing analyzer (`/research`)** — primary demo path. Enter a listing
   URL or make / model / year / mileage / price. The research pipeline
   collects comparables, explains exclusions, scores the ask with the
   same percentile engine as the dashboard, and optionally writes a
   grounded AI report.
2. **Deal dashboard (`/deal/...`)** — shareable SSR verdict, distribution
   chart, 24-month timeline, Trust Trace, fuel cost. Works with JS
   disabled.
3. **Optional AI extras** on the dashboard (brief + Q&A). Fun-fact and
   contact CRM are demoted; they are not the product story.

## Architecture

```
Browser
  ├─ /research  → POST /api/research → VehicleResearchAdapter
  │                 ├─ ListingCollector (SerpAPI | DEMO fallback)
  │                 ├─ normalize / dedupe / selectComparables
  │                 ├─ domain assessDeal + explainDeal
  │                 ├─ EvidenceBundle → optional AI report
  │                 └─ optional MongoDB session/observation persist
  └─ /deal/...  → GraphQL priceContext (existing car API, unchanged)
                    sources/vpic · fueleconomy · pricing-gen (DEMO)
```

Research types live in [`src/research/`](src/research/). The car GraphQL
schema (`makes`, `models`, `priceContext`, `fuelEconomy`) is **not**
genericized into Product/attribute — a thin `ResearchAdapter` is how a
second vertical (see laptop proof at `POST /api/research/laptop`) plugs in.

## Data honesty

| Source | Status |
| ------ | ------ |
| NHTSA vPIC / EPA fueleconomy | **Real** |
| Listing comparables | **SerpAPI** when `LISTING_SEARCH_API_KEY` or `SERPAPI_API_KEY` is set (`SEARCH_EXTRACTED` + real URLs); otherwise **DEMO fallback** from [`pricing-gen`](src/sources/pricing-gen.ts), labeled |
| Deal-dashboard market sample without research | **DEMO** (deterministic), badge everywhere |
| MongoDB (`MONGODB_URI`) | Optional — immutable observations + reproducible research sessions |

See [ADR 008](docs/adr/008-listing-collector.md) for the collector decision.

## Engineering highlights

- **Isomorphic conclusions** — SSR verdict HTML; Playwright `chromium-no-js`.
- **Trust Trace** — auditable receipt from the same pure `explainDeal` as the hero.
- **AI grounding** — FACTS / EvidenceBundle only; hallucinated listing IDs are stripped.
- **CI gates** — Vitest, Playwright ×3 browsers + no-JS, Lighthouse, JS budget (~220 KB).
- **Stack** — Next.js 16 App Router, React 19, GraphQL Yoga, D3, TypeScript strict.

## Portfolio / hiring themes

This repo started as an Edmunds-oriented pricing-transparency demo and
grew into a broader **evidence-backed research system**. Interviewers can
still click through performance, isomorphic JS, GraphQL design, and
testing — with the stronger commercial story that recommendations cite
real (or honestly labeled demo) listing evidence.

| Theme | Evidence |
| ----- | -------- |
| Pricing as context | Verdict + distribution + timeline + Trust Trace |
| Evidence pipeline | Listing analyzer, comparables, exclusions, confidence |
| Grounded GenAI | Research report + deal brief; model never invents numbers |
| API design | GraphQL car gateway + `/api/research` research path |
| Persistence with a point | MongoDB for observations/sessions when configured — not bolted onto `priceContext` |
| Extensibility without EAV | `LaptopResearchAdapter` proof route |

## Getting started

```bash
npm install
npm run dev
```

Optional env:

| Variable | Purpose |
| -------- | ------- |
| `LISTING_SEARCH_API_KEY` / `SERPAPI_API_KEY` | Live comparable search |
| `MOCK_LISTING_SEARCH=1` | Fixture-shaped search results (CI) |
| `ANTHROPIC_API_KEY` | AI brief / research report / finder |
| `STT_API_KEY` | Whisper STT + TTS |
| `MONGODB_URI` / `MONGODB_DB` | Save research sessions & price observations |
| `MOCK_AI` / `MOCK_STT` / `MOCK_TTS` | Deterministic CI mocks |

| Command | What it does |
| ------- | ------------ |
| `npm test` | Unit + contract tests (Vitest) |
| `npm run test:e2e` | Playwright (build first) |
| `npm run lint` / `npm run typecheck` | ESLint / strict TypeScript |
| `npx lhci autorun` | Lighthouse budget gate |

## ADRs

- [001 isomorphic D3](docs/adr/001-isomorphic-d3.md)
- [002 URL as state](docs/adr/002-url-as-state.md)
- [003 GraphQL gateway](docs/adr/003-graphql-gateway.md)
- [004 AWS deploy path](docs/adr/004-aws-deploy.md)
- [005 AI narrates, math decides](docs/adr/005-ai-native.md)
- [006 Voice input](docs/adr/006-voice-input.md)
- [007 Trust Trace](docs/adr/007-trust-trace.md)
- [008 Listing collector](docs/adr/008-listing-collector.md)
