# ADR 007 — Trust Trace is a pure function, not LLM prose

## Status

Accepted.

## Context

The deal page already shows a verdict (Great / Fair / Above / Insufficient)
from `assessDeal`. Shoppers — and interviewers — still ask "why?" The
obvious shortcut is to ask an LLM to explain. That would invent a second
scoring path in natural language, drift from the hero numbers, and
undermine the honesty spine (ADR 005: the model narrates, math decides).

We need explainability that is isomorphic, unit-testable, and identical
on every drag of the QuoteExplorer slider.

## Decision

**Explainability is `explainDeal(quote, samples)` — a pure domain
function that reuses `assessDeal` / `percentileValue` and returns ordered
audit steps.** The Trust Trace UI renders that receipt inside a
`<details>` element under the hero:

1. Summary line always visible (`How we scored this · n=… · P… · threshold…`).
2. Expanded steps: sample size vs `MIN_SAMPLE_SIZE`, quartiles, percentile
   meaning, P25/P75 verdict rules, outcome.
3. Footer: `DataSourceTag` honesty + methodology link; explicit "not
   AI-written."
4. QuoteExplorer calls `explainDeal` on every quote change — same path
   as the live verdict. No GraphQL field required for v1.

We deliberately do **not** let the deal-brief LLM write this panel.

## Consequences

- Interview demo: open Trust Trace → point at thresholds → "same function
  as the green headline."
- Thin markets stay honest: `INSUFFICIENT_DATA` steps explain the refusal.
- Future optional GraphQL `explanation` field can return the same shape;
  UI already speaks domain types.
