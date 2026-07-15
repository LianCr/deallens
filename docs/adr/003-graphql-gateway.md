# ADR 003 — A GraphQL gateway over three heterogeneous sources

## Status

Accepted.

## Context

The app aggregates three upstreams with different shapes and different
trust levels: NHTSA vPIC (real, quirky REST), fueleconomy.gov (real,
XML-first REST with naming drift), and a synthetic pricing generator
(demo data by necessity — no free real-transaction-price API exists).
Pages need a uniform, typed way to ask questions like "where does this
quote land for this vehicle."

## Decision

One graphql-yoga gateway (`/api/graphql`) owns all upstream access.
Design choices that matter:

- **Data honesty is in the type system.** `PriceContext.dataSource` is
  a `DataSourceTag` enum (`REAL | DEMO`); `percentile`, `p25`, `median`,
  `p75` are nullable because *insufficient data is an expressible
  answer*, not an error. The UI can't forget to distinguish demo from
  real — the schema forces the question.
- **Errors are classified, not stringly-typed.** Upstream failures map
  to extension codes (`UPSTREAM_TIMEOUT`, `UPSTREAM_FORMAT_DRIFT`,
  `UPSTREAM_UNAVAILABLE`, `INVALID_INPUT`), so clients can tell "retry
  later" from "fix your input."
- **Two cache tiers with different jobs.** DataLoader batches and
  dedupes within a request (N+1 guard); a module-level day-TTL cache
  spans requests for catalog-shaped data (vPIC model tables, EPA
  records — including honest nulls, so unmatched models don't retry
  every render).
- **One API, two transports.** Server components execute operations
  in-process against the same yoga instance (`executeGraphQL`) — no
  HTTP hop, no second data-access path to drift; external clients and
  GraphiQL use the HTTP endpoint.

## Consequences

- Adding a real pricing source (e.g. Marketcheck) is an adapter behind
  the same `PriceContext` resolver: implement the source client, flip
  `dataSource` to `REAL`, delete nothing.
- The schema is the contract the README documents and the live demo
  walks through; GraphiQL makes it explorable at `/api/graphql`.
- Cost: a gateway is more machinery than three fetch calls in page
  code. The typed honesty tags, error classification, and cache
  placement are what the machinery buys.
