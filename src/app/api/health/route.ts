import { buildHealthReport, probeUpstreams } from "@/lib/health";

/**
 * GET /api/health          → 200 { status: "ok", version, integrations }
 * GET /api/health?deep=1   → also probes NHTSA vPIC + fueleconomy.gov;
 *                            503 with status "degraded" if either fails.
 *
 * See docs/RUNBOOK.md — this is the first thing to check.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const deep = new URL(request.url).searchParams.get("deep") === "1";
  const upstreams = deep ? await probeUpstreams() : undefined;
  const report = buildHealthReport(process.env, upstreams);
  return Response.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
