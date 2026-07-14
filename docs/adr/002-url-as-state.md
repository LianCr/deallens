# ADR 002 — URL as the only client state (no Redux)

## Status

Accepted.

## Context

The app's state is: which vehicle, which quote, which fuel-cost
assumptions. A state library (Redux, Zustand, Jotai) is the reflexive
choice for "app state", and its absence in a portfolio repo could read
as an oversight rather than a decision. This document makes it a
decision.

## Decision

All durable state lives in the URL:

- `/deal/{make}/{year}/{model}?quote=24500` **is** the deal. Nothing
  else identifies it.
- The picker cascade is `searchParams` (`/?make=Honda&year=2022`); the
  server re-renders the next stage of the cascade from the URL alone.
- Ephemeral interaction state (cursor position, pinned event, range
  switch) is local `useState` in the one component that cares.

## Consequences

- **Shareable by construction.** Any screen can be sent to a family
  member and server-renders its conclusion — including with JavaScript
  disabled. This is the product's core demo moment.
- **SSR-trivial.** The server needs no session, no hydration of a
  store, no state reconciliation. `searchParams` in, HTML out.
- **One code path.** The no-JS form flow and the enhanced instant
  cascade produce identical URLs, so the server logic can't fork.
- At this scale a client state library would add a dependency, a
  parallel source of truth to keep in sync with the URL, and no
  capability the URL doesn't already provide. If cross-page client
  state ever appears (saved comparisons, auth), revisit — the seam
  would be a context provider at the layout level, not a rewrite.
