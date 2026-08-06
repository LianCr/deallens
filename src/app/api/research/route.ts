import { generateResearchReport } from "@/research/aiReport";
import { runVehicleResearch } from "@/research/pipeline";
import { saveResearchBundle } from "@/research/persist";
import { ManualVehicleSchema } from "@/research/targetIntake";

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

  try {
    const bundle = await runVehicleResearch({
      ...parsed.data,
      listingUrl: parsed.data.listingUrl || undefined,
    });
    const ai = await generateResearchReport(bundle, clientIp(request));
    await saveResearchBundle(bundle).catch(() => false);

    return Response.json({
      bundle,
      ai,
      persisted: Boolean(process.env.MONGODB_URI?.trim()),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Research failed";
    return Response.json({ reason: "research_failed", message }, { status: 502 });
  }
}
