# ADR 005 — AI narrates, math decides

## Status

Accepted.

## Context

The product's spine is trust engineering: server-computed verdicts,
honest data provenance, honest empty states. Adding LLM features the
obvious way — "ask the model what the car is worth" — would break that
spine: a language model asked for a number will produce one whether or
not it knows anything. Meanwhile the industry direction is clear:
Edmunds shipped the first car-shopping ChatGPT plugin and, with
Databricks, published a GenAI blueprint whose core idea is grounding
LLMs on proprietary structured data rather than using a general model
bare; Autotrader ships natural-language search. The question is how to
add that class of feature without giving up the honesty red lines.

## Decision

**The model never produces a number; it narrates numbers the pure
domain layer already produced.** Concretely, four mechanisms:

1. **Grounding is enforced server-side, not by prompt convention.**
   `/api/deal-brief` accepts only identifiers (make, year, model,
   quote) and recomputes the `PriceContext` in-process through the same
   GraphQL gateway the page uses. Client-supplied numbers never reach
   the prompt. The prompt input is a compact FACTS block built by a
   pure, snapshot-tested function (`src/ai/dealFacts.ts`) — the
   complete inventory of what the model may say. The system prompt
   forbids computing, extrapolating, or inventing figures, and the
   output is labeled on-page: "AI-generated · grounded in the numbers
   above."

2. **Hallucinations are dropped, not rendered.** The NL finder
   (`/api/find`) uses structured outputs (schema-constrained to the
   29-make whitelist) and then verifies every candidate against the
   live vPIC catalog; a model that suggests a vehicle the catalog
   doesn't know gets that suggestion silently removed and the response
   says how many were dropped. This is the DEMO-badge philosophy
   applied to generation: unverifiable output is not shown.

3. **A personal API key can face the public internet because the
   guardrails are sized for a demo.** Per-IP sliding windows (10/min,
   30/day) plus a global daily budget (300/day) cap worst-case spend at
   under $6/day; a response cache keyed by vehicle + 2%-bucketed quote
   means identical deals (pricing is deterministic) cost $0 after the
   first request. Limits are env-tunable and the 429 copy is honest
   ("AI is resting — daily demo budget reached"). Known limitation,
   accepted deliberately: the counters are in-memory, so on serverless
   they are per-instance best-effort, and a client that forges
   X-Forwarded-For rotates per-IP buckets — the global cap is the real
   spend ceiling. The upgrade path (Vercel KV / Upstash) is mechanical
   and not worth the dependency at demo scale.

4. **Tests never touch the model.** `MOCK_AI=1` makes both routes
   return deterministic canned output at runtime, so all four
   Playwright projects exercise the real streaming path, the real
   rate-limit path, and the real UI states with zero API cost and zero
   flake. The grounding pipeline (`dealFacts`), the guard, and the
   schema validation are pure functions with unit tests. The live model
   is only hit by manual local smoke tests.

Degradation is part of the contract: without `ANTHROPIC_API_KEY` the
routes return an honest 503 and the UI renders a "bring your own key"
card — clone-and-run stays free, and the verdict never depended on AI
(or JavaScript) in the first place.

## Consequences

- The AI features can't say anything the page doesn't already show —
  which is exactly the point. The brief is a narration layer, so a
  model regression can make it blander but not wronger about numbers.
- Recomputing context server-side costs one in-process GraphQL
  execution per uncached brief (~ms; the pricing source is
  deterministic and local).
- The finder's catalog verification adds a vPIC round-trip per
  candidate make/year, bounded at 3 candidates; when vPIC is down,
  candidates are dropped rather than shown unverified — availability is
  traded for honesty, consistent with ADR 003's error philosophy.
- Model/pricing facts (claude-opus-4-8, effort control, structured
  outputs) are pinned in one place (`src/app/api/*`), so a model swap
  is a one-line change plus a smoke test.
