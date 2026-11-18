/**
 * Health + integration status for GET /api/health.
 *
 * Two levels, on purpose:
 *  - shallow (default): process is up + which integrations this
 *    deployment has CONFIGURED. Booleans and modes only — never a key,
 *    a URI, or a prefix of one. Cheap enough for an uptime monitor.
 *  - deep (?deep=1): additionally probes the two keyless government
 *    APIs every page depends on (NHTSA vPIC, fueleconomy.gov) with a
 *    short timeout. Paid APIs (Anthropic, SerpAPI, OpenAI) are never
 *    probed: a health check must not spend money or quota.
 */

import { fetchUpstream, UpstreamError } from "@/sources/errors";

type Env = Record<string, string | undefined>;

const has = (env: Env, key: string): boolean => Boolean(env[key]?.trim());

export type IntegrationMode = "live" | "mock" | "off";

export interface IntegrationStatus {
  anthropic: IntegrationMode;
  listingSearch: "live" | "mock" | "demo-fallback";
  openaiVoice: { transcribe: IntegrationMode; speak: IntegrationMode };
  mongodb: "configured" | "off";
}

/** What this deployment is wired to, derived from env only. */
export function integrationStatus(env: Env = process.env): IntegrationStatus {
  const mode = (mockFlag: string, keyName: string): IntegrationMode =>
    env[mockFlag] === "1" ? "mock" : has(env, keyName) ? "live" : "off";

  const searchKey = has(env, "LISTING_SEARCH_API_KEY") || has(env, "SERPAPI_API_KEY");
  return {
    anthropic: mode("MOCK_AI", "ANTHROPIC_API_KEY"),
    // Mirrors listingCollector.ts: the mock flag wins, then a key, else DEMO.
    listingSearch:
      env.MOCK_LISTING_SEARCH === "1" ? "mock" : searchKey ? "live" : "demo-fallback",
    openaiVoice: {
      transcribe: mode("MOCK_STT", "STT_API_KEY"),
      speak: mode("MOCK_TTS", "STT_API_KEY"),
    },
    mongodb: has(env, "MONGODB_URI") ? "configured" : "off",
  };
}

export interface ProbeResult {
  name: string;
  ok: boolean;
  latencyMs: number;
  /** UpstreamError kind (TIMEOUT | HTTP | FORMAT) when not ok. */
  error?: string;
}

export const UPSTREAM_PROBES = [
  {
    name: "nhtsa-vpic",
    url: "https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/honda/modelyear/2022?format=json",
  },
  {
    name: "fueleconomy-gov",
    url: "https://www.fueleconomy.gov/ws/rest/fuelprices",
  },
] as const;

export const PROBE_TIMEOUT_MS = 3_000;

export async function probeUpstreams(
  probe: (source: string, url: string) => Promise<unknown> = (source, url) =>
    fetchUpstream(source, url, { headers: { accept: "application/json" } }, PROBE_TIMEOUT_MS),
  now: () => number = () => performance.now(),
): Promise<ProbeResult[]> {
  return Promise.all(
    UPSTREAM_PROBES.map(async ({ name, url }) => {
      const start = now();
      try {
        await probe(name, url);
        return { name, ok: true, latencyMs: Math.round(now() - start) };
      } catch (err) {
        const kind = err instanceof UpstreamError ? err.kind : "UNKNOWN";
        return { name, ok: false, latencyMs: Math.round(now() - start), error: kind };
      }
    }),
  );
}

export interface HealthReport {
  status: "ok" | "degraded";
  version: string;
  checkedAt: string;
  integrations: IntegrationStatus;
  upstreams?: ProbeResult[];
}

export function buildHealthReport(
  env: Env,
  upstreams: ProbeResult[] | undefined,
  checkedAt: Date = new Date(),
): HealthReport {
  const degraded = upstreams?.some((u) => !u.ok) ?? false;
  return {
    status: degraded ? "degraded" : "ok",
    // Vercel injects the deployed commit; "dev" locally.
    version: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev",
    checkedAt: checkedAt.toISOString(),
    integrations: integrationStatus(env),
    ...(upstreams ? { upstreams } : {}),
  };
}
