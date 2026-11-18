# DealLens runbook

Symptom → first check → fix → verify. Entries marked **(incident)**
actually happened on this repo; the rest are failure modes the code is
built to handle, with the file that handles them.

## First checks, in order

1. `curl -s https://deallens-xi.vercel.app/api/health` — is the process
   up, which commit is deployed (`version`), and which integrations are
   `live` / `mock` / `off` / `demo-fallback`.
2. `curl -s 'https://deallens-xi.vercel.app/api/health?deep=1'` — `503`
   + `"status":"degraded"` means NHTSA vPIC or fueleconomy.gov failed a
   3 s probe; `upstreams[].error` says `TIMEOUT` or `HTTP`.
3. Vercel → Project → Logs, filter on `event`: `research.failed`,
   `research.ai_report_failed`, `research.persist_failed`. Each line is
   JSON with `durationMs` and, for upstream failures,
   `upstream: { source, kind }`.
4. GitHub → Actions → the failing job's first red step.

---

## CI: `npm ci` fails before any test runs **(incident, 2026-08-06 → 2026-11-17)**

- **Symptom:** every job red in ~20 s at "Run npm ci":
  `npm ci can only install packages when your package.json and
  package-lock.json … are in sync` / `Missing: @emnapi/core@… from lock file`.
- **Cause:** the lockfile was written by a different npm major than the
  one CI uses. CI runs Node 22, which ships npm 10; a lock regenerated
  with npm 11 (Node 24 locally) dropped optional `@emnapi/*` entries
  that npm 10 requires.
- **Fix:** regenerate with CI's npm: `npx -y npm@10.9.2 install`, commit
  `package-lock.json`.
- **Verify:** `npx -y npm@10.9.2 ci` **and** `npm ci` both succeed
  locally; CI "quality" job passes `npm ci`.
- **Prevent:** don't commit a lock produced by a newer npm than CI's, or
  pin `packageManager` / bump CI's Node in the same PR.

## CI: `picker.spec.ts @no-js` times out on "Continue" **(incident, 2026-08-03)**

- **Symptom:** `locator.click: Test timeout of 30000ms exceeded …
  element is not stable` in the `chromium-no-js` project only.
- **Cause:** the home hero's entrance animation used `translateY` on the
  wrapper that contains the picker form, so the button kept moving
  while Playwright waited for two identical frames.
- **Fix:** the animation is opacity-only (`src/app/page.module.css`,
  `@keyframes heroIn`). A fade never moves layout.
- **Verify:** `npx playwright test --project=chromium-no-js` — no added
  waits or `force: true`.
- **Rule:** never "fix" this class of flake with `reducedMotion` or
  `force` in the test; that hides a real UX problem (a moving target
  under the user's cursor).

## CI: an E2E job runs for 20+ minutes with no output **(incident, 2026-11-18)**

- **Symptom:** one browser job (seen on WebKit) stays in
  `npx playwright test` long after the others finish.
- **Behavior now:** jobs have `timeout-minutes` (quality 15, E2E 20,
  Lighthouse 15), so a hang fails instead of holding a runner for
  GitHub's 6-hour default.
- **Not the same thing:** `npx playwright install --with-deps` can take
  ~9 minutes when the runner's apt mirrors are slow (seen 2026-11-18,
  tests themselves took 23 s). Check which step is slow before
  re-running.
- **Fix:** re-run the job; if it hangs twice, download the trace
  artifact (`trace: on-first-retry`) and look for a test waiting on a
  network response that never comes.

## CI: known flaky test

- `e2e/ask.spec.ts` › "a second question replays the first turn to the
  server" on **WebKit** — the "Ask" button was still `disabled` when
  clicked; passed on retry (CI `retries: 2`, reported as `1 flaky`,
  2026-11-18). Not yet fixed — likely the click races the end of the
  first streamed answer.

## `/research` returns `502 research_failed` with `[serpapi] …`

- **Symptom:** listing analyzer shows an error; log line
  `research.failed` with `upstream: { source: "serpapi", kind: "HTTP" }`.
- **Likely causes:** SerpAPI key invalid (`HTTP 401`) or account out of
  searches (`HTTP 429` / `error` field in the body), or a SerpAPI
  timeout (`kind: "TIMEOUT"`, 8 s limit in `src/sources/errors.ts`).
- **Fix:** SerpAPI dashboard → check remaining searches / regenerate
  key → Vercel env `SERPAPI_API_KEY` (or `LISTING_SEARCH_API_KEY`) →
  redeploy (env changes only apply to new deployments). To keep the
  demo up while the account is empty, **remove** the key: the collector
  falls back to labeled DEMO comparables
  (`activeListingCollector()` in `src/research/collectors/listingCollector.ts`).
- **Verify:** `/api/health` shows `listingSearch: "live"` (or
  `"demo-fallback"` if removed) and an analyzer run returns 200.
- **Known gap:** with a key set, a SerpAPI failure is a hard 502 rather
  than an automatic DEMO fallback. That is deliberate for now (a silent
  switch to demo data would be dishonest without a visible banner) —
  see TODO below.
- **Security note:** before PR #10, this error message included the
  full SerpAPI URL **with `api_key`** and was returned to the browser.
  `redactUrl()` now strips it. If production ever hit this path with a
  real key, rotate the key.

## AI features say "unavailable" / return 503, 429 or 502

- **503** `This deployment has no ANTHROPIC_API_KEY configured` — set
  the key in Vercel env and redeploy. `/api/health` →
  `anthropic: "off"` confirms.
- **429** with `reason` `ip-minute` / `ip-day` / `global-day` — the cost
  guard in `src/ai/guard.ts` (defaults 10/min, 30/day per IP, 300/day
  global; override with `AI_LIMIT_IP_PER_MINUTE`, `AI_LIMIT_IP_PER_DAY`,
  `AI_LIMIT_GLOBAL_PER_DAY`). Counters are in-memory per serverless
  instance, so they reset on cold start and are not shared across
  instances — acceptable at demo scale (ADR 005).
- **502** — the model call failed (overload, timeout, bad key). Check
  the Anthropic console for status/credit.
- **Listing analyzer** is not affected: if the research report call
  throws, `/api/research` still returns the deterministic result with
  `ai: null` and logs `research.ai_report_failed`.
- **Web search cost:** set `AI_WEB_SEARCH=0` to turn off the Anthropic
  web-search tool without a code change.

## Voice: mic missing or "speech account is out of credit"

- `GET /api/transcribe` / `GET /api/speak` → `{"enabled": false}` means
  no `STT_API_KEY`; the UI falls back to the browser's speech API or
  hides the mic.
- `502 bad-key` / `502 no-quota` — OpenAI rejected the key or the
  account has no credit (`src/app/api/transcribe/route.ts`,
  `src/app/api/speak/route.ts`). Typed input keeps working.

## Picker says "Couldn't reach the vehicle catalog (NHTSA)"

- **Check:** `/api/health?deep=1` → `nhtsa-vpic` `ok: false`.
- **Cause:** vPIC is a free government API with occasional slowness and
  maintenance windows; requests time out at 8 s and GraphQL returns
  `UPSTREAM_TIMEOUT` / `UPSTREAM_UNAVAILABLE` with `source`.
- **Fix:** nothing to deploy; it recovers when vPIC does. If vPIC
  changes its response shape, resolvers return `UPSTREAM_FORMAT_DRIFT`
  and the contract tests in `src/sources/vpic.contract.test.ts` are the
  place to update fixtures.

## Fuel price or MPG missing on the dashboard

- fueleconomy.gov had no confident match (by design `fuelEconomy` is
  `null` rather than a forced pairing) or the weekly price feed failed
  (`dollarsPerGallon: null`). The MPG and the verdict still render.

## "Analyze from URL" fails with 422 `fetch_failed`

- **Expected for many sites:** dealer and marketplace pages often block
  bots or render prices client-side. The analyzer tells the user to
  enter details manually; there is no scraping workaround, by policy
  (ADR 008).
- **Check:** the URL is reachable from a server (no login wall).

## MongoDB configured but sessions are not saved

- **Symptom:** research results do not show "· saved"; log line
  `research.persist_failed`.
- **Behavior:** persistence is optional and never blocks a response.
  The driver fails fast (`serverSelectionTimeoutMS: 3000`,
  `src/research/persist.ts`) and a failed connection is not cached, so
  the next request retries.
- **Fix:** check `MONGODB_URI` / `MONGODB_DB`, Atlas network access
  (Vercel egress IPs are dynamic — allow `0.0.0.0/0` for a demo
  cluster, or use Atlas's Vercel integration), and cluster status.

## Deploy: Vercel build is green but the site shows old behavior

- Env var changes apply only to **new** deployments — redeploy.
- Compare `/api/health` `version` with the commit you expect
  (`VERCEL_GIT_COMMIT_SHA`, first 7 chars).

## CI: Lighthouse job fails on performance but nothing changed

- Lighthouse on shared GitHub runners is noisy. Check the uploaded
  report link in the job log: if TBT/LCP jumped on one URL only,
  re-run the job once. If it fails twice, treat it as real and compare
  `npm run check:js-budget` output with the last green run (current:
  home 191.3 KB, deal 208.8 KB, contact 187.5 KB gzip, budget 220 KB).

## CI: accessibility gate fails

- The failure lists `rule (impact) ×count: selectors`. Most common:
  `color-contrast` after a color change. Fix via the tokens in
  `src/app/globals.css` (`--color-on-accent`, `--color-accent-text`,
  `--color-lens-text`, `--color-on-fg`) — check **both** light and
  dark mode. Never add `disableRules` / `exclude` to make it pass.
- Run locally: `npm run build && npm run test:a11y`.

---

## Manual accessibility checks axe cannot do

- Tab through `/`, `/research`, the deal page: visible focus on every
  control, logical order, no traps in the voice and Q&A widgets.
- VoiceOver (macOS) on the deal page: verdict and Trust Trace are read
  as text; charts have a text equivalent.

## TODO

- Decide whether a SerpAPI failure with a key set should fall back to
  DEMO comparables with a visible "live search unavailable" banner.
- `/api/research/parse-url` fetches a user-supplied URL server-side;
  add a host allow-list or block private IP ranges before this is more
  than a demo.
- External uptime monitor on `/api/health` (e.g. a free UptimeRobot
  check) — needs an account.
