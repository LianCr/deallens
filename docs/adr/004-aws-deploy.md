# ADR 004 — Deployment: Vercel now, a documented AWS path

## Status

Accepted (Vercel); AWS path documented, deliberately not built.

## Context

The demo needs a public URL with SSR. The author also deploys
production workloads on AWS and Render elsewhere; this ADR records how
DealLens would move to AWS so the choice of Vercel reads as sequencing,
not a ceiling.

## Decision

Deploy on Vercel: `next build` output maps 1:1 onto its platform
(server-rendered routes → serverless functions, static assets → CDN),
so the demo ships in minutes with zero platform code.

## The AWS path (when needed)

Using SST (or OpenNext directly), which packages Next.js App Router
output for AWS primitives:

1. **Compute** — server-rendered routes and the GraphQL gateway run as
   Lambda functions behind CloudFront (OpenNext splits the server
   bundle; cold-start mitigation via provisioned concurrency on the
   deal-page function only).
2. **Static/CDN** — `_next/static` and public assets to S3, served
   through the same CloudFront distribution with immutable cache
   headers (hashed filenames already make this safe).
3. **Caching** — today's in-memory day-TTL caches (vPIC models, EPA
   records) move to DynamoDB with TTL attributes or ElastiCache;
   the cache interface in `graphql/loaders.ts` is already the seam.
4. **CI/CD** — the existing GitHub Actions pipeline gains an
   `sst deploy --stage prod` job gated on the Lighthouse budget job
   that already exists.
5. **Observability** — CloudWatch structured logs from the gateway's
   classified errors (the `UpstreamError.kind` field maps directly to
   metric dimensions).

## Consequences

- Nothing in the codebase assumes Vercel: no edge-only APIs, Node
  runtime declared explicitly on server routes, caches behind a seam.
- The migration is infrastructure work, not application work — which
  is the point of documenting instead of building it for a demo.
