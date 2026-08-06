import { z } from "zod";
import { parseListingUrl } from "@/research/targetIntake";

export const runtime = "nodejs";

const BodySchema = z.object({
  url: z.string().url(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ reason: "invalid_json", message: "Expected JSON body." }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ reason: "invalid_input", message: "A valid listing URL is required." }, { status: 400 });
  }

  const result = await parseListingUrl(parsed.data.url);
  if (!result) {
    return Response.json(
      {
        reason: "fetch_failed",
        message:
          "Could not fetch or parse that listing page. Enter the vehicle details manually.",
        partial: { listingUrl: parsed.data.url },
        warnings: ["URL fetch failed or was blocked by the host."],
      },
      { status: 422 },
    );
  }

  return Response.json(result);
}
