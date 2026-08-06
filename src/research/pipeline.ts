/**
 * End-to-end vehicle research pipeline: parse → collect → normalize →
 * comparables → existing price engine → EvidenceBundle.
 */

import { randomUUID } from "crypto";
import { assessDeal } from "@/domain/verdict";
import { explainDeal } from "@/domain/explainDeal";
import { activeListingCollector } from "./collectors/listingCollector";
import { vehicleResearchAdapter } from "./vehicleAdapter";
import type {
  EvidenceBundle,
  ManualVehicleInput,
  ResearchSession,
} from "./types";

export async function runVehicleResearch(
  input: ManualVehicleInput,
): Promise<EvidenceBundle> {
  const adapter = vehicleResearchAdapter;
  const request = await adapter.parseRequest(input);
  const collector = activeListingCollector();

  const session: ResearchSession = {
    id: randomUUID(),
    query: request.rawQuery,
    category: "VEHICLE",
    status: "COLLECTING",
    createdAt: new Date().toISOString(),
  };

  const raw = await adapter.collectEvidence(request);
  session.status = "ANALYZING";

  const candidates = adapter.normalize(raw);
  const comparables = adapter.selectComparables(request.target, candidates);
  const prices = comparables.observations.map((o) => o.price);
  const { verdict, percentile } = assessDeal(request.target.price, prices);
  const explanation = explainDeal(request.target.price, prices);

  const tags = new Set(
    [request.target, ...comparables.included].map((o) => o.source.dataSource),
  );
  let dataSource: EvidenceBundle["dataSource"] = "DEMO";
  if (tags.size === 1) {
    dataSource = [...tags][0] as EvidenceBundle["dataSource"];
  } else if (tags.has("SEARCH_EXTRACTED") || tags.has("REAL")) {
    dataSource = tags.has("DEMO") ? "MIXED" : "SEARCH_EXTRACTED";
  }

  session.status = "COMPLETE";
  session.completedAt = new Date().toISOString();

  return {
    session,
    target: request.target,
    comparables,
    verdict,
    percentile,
    explainSteps: explanation.steps,
    dataSource,
    collectorMode: collector.mode,
  };
}
