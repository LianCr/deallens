import { describe, expect, test } from "vitest";
import {
  dedupeOffers,
  inferTrim,
  scoreConfidence,
  selectComparables,
} from "@/research/comparables";
import type { NormalizedOffer, SourceEvidence } from "@/research/types";
import {
  extractMileage,
  extractPrice,
  loadFixtureHits,
  rawHitsToOffers,
} from "@/research/collectors/listingCollector";
import { validateResearchReport } from "@/research/aiReport";
import { runVehicleResearch } from "@/research/pipeline";
import { buildResearchFacts } from "@/research/evidenceBundle";

function src(id: string, url: string): SourceEvidence {
  return {
    id,
    sourceName: "test",
    sourceUrl: url,
    retrievedAt: "2026-01-01T00:00:00.000Z",
    evidenceType: "LISTING",
    extractionConfidence: 0.8,
    dataSource: "SEARCH_EXTRACTED",
  };
}

function offer(
  partial: Partial<NormalizedOffer> & Pick<NormalizedOffer, "id" | "price" | "year">,
): NormalizedOffer {
  return {
    category: "VEHICLE",
    title: `${partial.year} Honda Civic`,
    make: "Honda",
    model: "Civic",
    condition: "USED",
    source: src(partial.id, `https://example.com/${partial.id}`),
    ...partial,
  };
}

describe("listing field extraction", () => {
  test("extracts price and mileage from listing text", () => {
    expect(extractPrice("Listed at $24,500 near LA")).toBe(24500);
    expect(extractMileage("42,100 miles · clean title")).toBe(42100);
  });
});

describe("comparables", () => {
  test("dedupes identical source URLs", () => {
    const a = offer({ id: "a", price: 24000, year: 2022, source: src("a", "https://x.test/1") });
    const b = offer({ id: "b", price: 24100, year: 2022, source: src("b", "https://x.test/1") });
    const { unique, exclusions } = dedupeOffers([a, b]);
    expect(unique).toHaveLength(1);
    expect(exclusions[0]?.reason).toMatch(/same source URL/i);
  });

  test("excludes wrong year and high mileage deltas", () => {
    const target = offer({
      id: "t",
      price: 24500,
      year: 2022,
      mileage: 40000,
    });
    const peers = [
      offer({ id: "ok", price: 25000, year: 2022, mileage: 42000 }),
      offer({ id: "old", price: 20000, year: 2018, mileage: 42000 }),
      offer({ id: "hi", price: 23000, year: 2022, mileage: 120000 }),
    ];
    const set = selectComparables(target, peers);
    expect(set.included.map((o) => o.id)).toEqual(["ok"]);
    expect(set.exclusions.some((e) => e.itemId === "old")).toBe(true);
    expect(set.exclusions.some((e) => e.itemId === "hi")).toBe(true);
  });

  test("confidence drops when trim is missing", () => {
    const full = scoreConfidence(12, 0);
    const thin = scoreConfidence(12, 12);
    expect(full.confidenceScore).toBeGreaterThan(thin.confidenceScore);
    expect(inferTrim("2022 Honda Civic EX Touring", "Civic")).toBeTruthy();
  });
});

describe("fixture collector path", () => {
  test("fixture hits normalize into priced offers", async () => {
    const hits = await loadFixtureHits("Honda", "Civic", 2022);
    const offers = rawHitsToOffers(hits, { make: "Honda", model: "Civic", year: 2022 });
    expect(offers.length).toBeGreaterThanOrEqual(8);
    expect(offers.every((o) => o.source.sourceUrl.startsWith("http"))).toBe(true);
  });
});

describe("pipeline + AI validation", () => {
  test("demo fallback research produces a complete EvidenceBundle", async () => {
    const prev = process.env.MOCK_LISTING_SEARCH;
    delete process.env.MOCK_LISTING_SEARCH;
    delete process.env.LISTING_SEARCH_API_KEY;
    delete process.env.SERPAPI_API_KEY;

    const bundle = await runVehicleResearch({
      make: "Honda",
      model: "Civic",
      year: 2022,
      price: 24500,
      mileage: 42000,
    });
    expect(bundle.collectorMode).toBe("DEMO_FALLBACK");
    expect(bundle.comparables.sampleSize).toBeGreaterThanOrEqual(8);
    expect(bundle.explainSteps.length).toBeGreaterThan(0);
    expect(buildResearchFacts(bundle)).toContain("TARGET_PRICE_USD: 24500");

    if (prev !== undefined) process.env.MOCK_LISTING_SEARCH = prev;
  });

  test("validateResearchReport strips unknown option ids", async () => {
    process.env.MOCK_LISTING_SEARCH = "1";
    const bundle = await runVehicleResearch({
      make: "Honda",
      model: "Civic",
      year: 2022,
      price: 24500,
      mileage: 42000,
    });
    const cleaned = validateResearchReport(
      {
        recommendation: "ok",
        reasoning: "because",
        bestValueOption: "not-a-real-id",
        cheapestAcceptableOption: bundle.comparables.included[0]?.id,
        risks: ["r"],
        followUpQuestions: ["q"],
        confidenceExplanation: "c",
        evidenceIds: ["bogus", bundle.comparables.included[0]?.id ?? ""],
      },
      bundle,
    );
    expect(cleaned.bestValueOption).toBeUndefined();
    expect(cleaned.cheapestAcceptableOption).toBe(bundle.comparables.included[0]?.id);
    expect(cleaned.evidenceIds).not.toContain("bogus");
  });
});
