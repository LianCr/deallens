/**
 * ADR 008 — Listing collector for evidence-backed research
 *
 * ## Status
 * Accepted.
 *
 * ## Context
 * DealLens already has strong deterministic pricing math and grounded AI
 * narration, but market samples came from a synthetic generator. The
 * product pivot requires *citable* comparable listings without turning
 * the app into an unauthorized scraper or an "search the entire internet"
 * claim.
 *
 * ## Decision
 * 1. Introduce a `ListingCollector` interface with one live implementation
 *    backed by **SerpAPI Google search** (`LISTING_SEARCH_API_KEY` or
 *    `SERPAPI_API_KEY`). Results include real `sourceUrl` values the user
 *    can open. Field extraction from titles/snippets is best-effort and
 *    tagged `SEARCH_EXTRACTED`.
 * 2. When no key is present, fall back to the existing deterministic
 *    `pricing-gen` wrapped as demo listings with explicit DEMO badges and
 *    `demo.deallens.local` URLs — clone-and-run stays green; demos that
 *    claim live evidence must set the key.
 * 3. `MOCK_LISTING_SEARCH=1` serves fixture-shaped organic results for
 *    CI/contract tests (same path as live collector).
 * 4. Existing Anthropic `webSearch` remains for recalls/incentives/facts —
 *    it is **not** the listing collector.
 * 5. Vehicle GraphQL schema is unchanged; research runs via
 *    `/api/research` + `VehicleResearchAdapter`.
 *
 * ## Consequences
 * - Live evidence quality depends on search snippet richness (trim/mileage
 *   often missing → confidence downgrades — intentional honesty).
 * - SerpAPI is a paid, ToS-approved path; we do not scrape Cars.com HTML.
 * - DEMO fallback must never be labeled REAL.
 */

export {};
