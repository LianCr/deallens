# DealLens architecture

One Next.js 16 App Router app, deployed on Vercel. No separate backend:
route handlers are the API, server components call the same GraphQL
schema in-process, and every external dependency sits behind a module
in `src/sources/`, `src/research/collectors/` or `src/ai/` that can be
mocked by an env flag.

## System context

```mermaid
flowchart LR
  user([Shopper's browser])

  subgraph vercel["Vercel — Next.js 16 (Node runtime)"]
    pages["Server components<br/>/ · /research · /deal/... · /contact"]
    gql["GraphQL Yoga<br/>/api/graphql"]
    research["/api/research<br/>(+ parse-url, laptop)"]
    ai["AI routes<br/>deal-brief · deal-ask · find · fun-fact"]
    voice["Voice routes<br/>transcribe · speak"]
    health["/api/health"]
    guard["AiGuard<br/>per-IP + global limits,<br/>brief cache (in-memory)"]
  end

  vpic[(NHTSA vPIC)]
  fe[(fueleconomy.gov<br/>MPG + weekly fuel price)]
  serp[(SerpAPI<br/>Google results)]
  claude[(Anthropic<br/>Messages API)]
  openai[(OpenAI audio)]
  mongo[(MongoDB<br/>optional)]
  site[(Listing pages)]

  user -->|HTML, works without JS| pages
  user -->|fetch / stream| research & ai & voice
  user -->|GraphiQL / clients| gql
  pages -->|executeGraphQL in-process| gql
  gql --> vpic & fe
  research --> serp
  research --> site
  research --> claude
  research -.-> mongo
  ai --> guard --> claude
  voice --> guard
  voice --> openai
  health -. deep=1 .-> vpic & fe
```

Dashed lines are optional: MongoDB is a no-op without `MONGODB_URI`;
the deep health probe only runs on request.

## Listing analyzer request (`POST /api/research`)

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser (/research)
  participant R as /api/research
  participant P as runVehicleResearch
  participant C as ListingCollector
  participant D as domain (assessDeal, explainDeal)
  participant A as generateResearchReport
  participant M as MongoDB

  B->>R: { make, model, year, price, mileage }
  R->>R: zod ManualVehicleSchema (400 invalid_input)
  R->>P: parsed input
  P->>C: collect(make, model, year)
  alt SerpAPI key set
    C->>C: serpapi.com/search.json (8 s timeout)
  else MOCK_LISTING_SEARCH=1
    C->>C: fixture hits
  else no key
    C->>C: DEMO hits from pricing-gen (labeled)
  end
  C-->>P: raw hits (title, link, snippet)
  P->>P: normalize → dedupe → selectComparables (±1 yr, ±40k mi)
  P->>D: target price vs comparable prices
  D-->>P: verdict, percentile, explain steps
  P-->>R: EvidenceBundle (every number cites a source)
  R->>A: bundle (FACTS only)
  A-->>R: structured report or null (no key / limited / model error)
  R-->>M: save session + observations (failure logged, not fatal)
  R-->>B: 200 { bundle, ai, persisted }
  Note over R: one JSON log line per request:<br/>research.completed / research.failed
```

The verdict is decided in step 7 by pure functions in `src/domain/`
before any model is called. The model only receives the finished
`EvidenceBundle` and its output is validated: evidence IDs that are not
in the bundle are stripped.

## Deal dashboard (`/deal/honda/2022/civic?quote=24500`)

```mermaid
flowchart TB
  url["URL = state<br/>make / year / model / ?quote"] --> sc["Server component"]
  sc -->|executeGraphQL| schema["Same Yoga schema as /api/graphql"]
  schema --> loaders["DataLoader per request<br/>(dedupe upstream calls)"]
  loaders --> vpic[(vPIC)] & fe[(fueleconomy.gov)] & gen["pricing-gen<br/>(DEMO, deterministic)"]
  sc --> html["SSR HTML: verdict, Trust Trace,<br/>SVG chart skeletons"]
  html --> islands["Client islands hydrate on scroll:<br/>D3 distribution + timeline, quote explorer,<br/>AI brief / Q&A, voice"]
  html -.->|JS disabled| works["Still readable:<br/>verdict, receipt, charts, GET-form slider"]
```

## Where things live

| Concern | Path |
| ------- | ---- |
| Pricing math (pure, unit-tested) | `src/domain/` |
| Upstream clients + error classification | `src/sources/` (`errors.ts`: TIMEOUT / HTTP / FORMAT, secrets redacted from messages) |
| GraphQL schema, resolvers, loaders | `src/graphql/` — SDL published at [`docs/schema.graphql`](schema.graphql) |
| Research pipeline + collectors | `src/research/` |
| AI prompts, grounding facts, rate guard | `src/ai/` |
| Health + structured logs | `src/lib/health.ts`, `src/lib/log.ts` |
| Decisions | [`docs/adr/`](adr/) |

## Quality gates (`.github/workflows/ci.yml`)

```mermaid
flowchart LR
  q["quality<br/>lint · typecheck · vitest · build ·<br/>first-load JS ≤ 220 KB gzip/route"]
  q --> e1["E2E chromium<br/>+ no-JS project<br/>+ axe WCAG 2.1 AA"]
  q --> e2["E2E firefox"]
  q --> e3["E2E webkit"]
  q --> lh["Lighthouse CI<br/>perf ≥ 0.95 · a11y ≥ 0.95 ·<br/>LCP ≤ 2.5 s · CLS ≤ 0.1 · TBT ≤ 200 ms"]
```

All E2E and Lighthouse jobs run against the production build
(`next start`) with every paid integration mocked.
