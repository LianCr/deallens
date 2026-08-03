# TrustTrace

Auditable pricing receipt. Renders `explainDeal(quote, samples)` —
the same pure functions behind the hero verdict.

## Contract

- **Input:** a `DealExplanation` from `@/domain/explainDeal` (and optional `dataSource`).
- **Output:** a `<details>` summary + ordered audit steps. Works without JavaScript.
- **Not LLM prose:** the model may only restate domain numbers; this *is* the domain layer, visible.

## Why it exists

Interviewers (and shoppers) can open "How we scored this" and see sample
size, quartiles, percentile, and P25/P75 thresholds — trust as UI, not a claim.
