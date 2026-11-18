import { generateResearchReport } from "@/research/aiReport";
import { runVehicleResearch } from "@/research/pipeline";
import { saveResearchBundle } from "@/research/persist";
import { ManualVehicleSchema } from "@/research/targetIntake";
import { logEvent } from "@/lib/log";
import { UpstreamError } from "@/sources/errors";

export const runtime = "nodejs";

const clientIp = (request: Request): string =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ reason: "invalid_json", message: "Expected JSON body." }, { status: 400 });
  }

  const parsed = ManualVehicleSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        reason: "invalid_input",
        message: "Make, model, year, and price are required.",
      },
      { status: 400 },
    );
  }

  const started = performance.now();
  try {
    const bundle = await runVehicleResearch({
      ...parsed.data,
      listingUrl: parsed.data.listingUrl || undefined,
    });
    // AI narrates, math decides: a model outage (529, timeout, bad key)
    // must not take down the deterministic result. The UI already treats
    // `ai: null` as "no AI report", same as a keyless deployment.
    const ai = await generateResearchReport(bundle, clientIp(request)).catch((err: unknown) => {
      logEvent("warn", "research.ai_report_failed", {
        route: "/api/research",
        error: err instanceof Error ? err.name : "unknown",
      });
      return null;
    });
    const persisted = await saveResearchBundle(bundle).catch((err: unknown) => {
      logEvent("warn", "research.persist_failed", {
        route: "/api/research",
        // Error class only: driver messages can echo connection details.
        error: err instanceof Error ? err.name : "unknown",
      });
      return false;
    });

    logEvent("info", "research.completed", {
      route: "/api/research",
      durationMs: Math.round(performance.now() - started),
      collectorMode: bundle.collectorMode,
      dataSource: bundle.dataSource,
      comparables: bundle.comparables.included.length,
      verdict: bundle.verdict,
      persisted,
    });

    return Response.json({
      bundle,
      ai,
      // Whether this session was actually written — not merely whether
      // a database is configured.
      persisted,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Research failed";
    logEvent("error", "research.failed", {
      route: "/api/research",
      durationMs: Math.round(performance.now() - started),
      // e.g. source "serpapi", kind "HTTP" on quota exhaustion — see RUNBOOK.
      // Upstream messages embed request URLs, so log only the
      // classification for those; local errors keep their message.
      ...(err instanceof UpstreamError
        ? { upstream: { source: err.source, kind: err.kind } }
        : { message }),
    });
    return Response.json({ reason: "research_failed", message }, { status: 502 });
  }
}
