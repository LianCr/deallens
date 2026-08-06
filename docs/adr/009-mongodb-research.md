/**
 * ADR 009 — MongoDB for reproducible research observations
 *
 * ## Status
 * Accepted.
 *
 * ## Context
 * The GraphQL `priceContext` path is intentionally stateless. Saved
 * research needs somewhere to store immutable listing observations and
 * reproducible EvidenceBundles so a shopper (or interviewer) can reopen
 * a prior report and so future work can chart how a market moved.
 *
 * ## Decision
 * - Optional MongoDB via `MONGODB_URI` (database `MONGODB_DB` or `deallens`).
 * - Collections: `research_sessions`, `price_observations`.
 * - When unset, `/api/research` still returns a full in-memory report —
 *   clone-and-run never requires Mongo.
 * - Do **not** force Mongo into the existing `priceContext` resolver.
 *
 * ## Narrative
 * MongoDB stores immutable listing observations and reproducible research
 * reports, allowing DealLens to track how a market changes over time.
 */

export {};
