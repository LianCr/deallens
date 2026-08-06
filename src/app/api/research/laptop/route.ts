import { assessDeal } from "@/domain/verdict";
import { explainDeal } from "@/domain/explainDeal";
import { laptopResearchAdapter } from "@/research/laptopAdapter";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
  title: z.string().trim().min(2).max(120),
  price: z.number().int().min(100).max(20_000),
});

/**
 * Light second-vertical proof — not a production laptop product.
 * DEMO catalog only.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ reason: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ reason: "invalid_input" }, { status: 400 });
  }

  const adapter = laptopResearchAdapter;
  const req = await adapter.parseRequest(parsed.data);
  const raw = await adapter.collectEvidence(req);
  const candidates = adapter.normalize(raw);
  const comparables = adapter.selectComparables(req.target, candidates);
  const prices = comparables.observations.map((o) => o.price);
  const { verdict, percentile } = assessDeal(req.target.price, prices);
  const explanation = explainDeal(req.target.price, prices);

  return Response.json({
    category: "LAPTOP",
    target: req.target,
    comparables,
    verdict,
    percentile,
    explainSteps: explanation.steps,
    dataSource: "DEMO",
    note: "Laptop adapter is a pipeline extensibility proof, not a live catalog.",
  });
}
