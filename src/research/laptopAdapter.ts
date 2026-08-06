/**
 * Light second vertical — proves ResearchAdapter is not car-only.
 * Uses a tiny demo catalog; not a production laptop business.
 */

import { percentileValue } from "@/domain/percentile";
import type { ResearchAdapter } from "./adapter";
import { scoreConfidence } from "./comparables";
import type {
  ComparableSet,
  NormalizedOffer,
  PriceObservation,
  SourceEvidence,
} from "./types";

export interface LaptopResearchRequest {
  category: "LAPTOP";
  rawQuery: string;
  target: NormalizedOffer;
}

export interface RawLaptopHit {
  title: string;
  link: string;
  price: number;
  ramGb: number;
  storageGb: number;
  cpu: string;
}

const DEMO_LAPTOPS: RawLaptopHit[] = [
  {
    title: "Dell XPS 13 — 16GB/512GB",
    link: "https://demo.deallens.local/laptops/xps13-16",
    price: 999,
    ramGb: 16,
    storageGb: 512,
    cpu: "Intel Core Ultra 7",
  },
  {
    title: "Dell XPS 13 — 32GB/1TB",
    link: "https://demo.deallens.local/laptops/xps13-32",
    price: 1299,
    ramGb: 32,
    storageGb: 1024,
    cpu: "Intel Core Ultra 7",
  },
  {
    title: "MacBook Air 13 M3 — 16GB/512GB",
    link: "https://demo.deallens.local/laptops/mba-m3",
    price: 1199,
    ramGb: 16,
    storageGb: 512,
    cpu: "Apple M3",
  },
  {
    title: "Lenovo Yoga 7 — 16GB/512GB",
    link: "https://demo.deallens.local/laptops/yoga7",
    price: 849,
    ramGb: 16,
    storageGb: 512,
    cpu: "AMD Ryzen 7",
  },
  {
    title: "HP Envy 14 — 16GB/512GB",
    link: "https://demo.deallens.local/laptops/envy14",
    price: 929,
    ramGb: 16,
    storageGb: 512,
    cpu: "Intel Core Ultra 5",
  },
  {
    title: "ASUS Zenbook 14 — 16GB/512GB",
    link: "https://demo.deallens.local/laptops/zenbook14",
    price: 899,
    ramGb: 16,
    storageGb: 512,
    cpu: "Intel Core Ultra 7",
  },
  {
    title: "Acer Swift 5 — 16GB/512GB",
    link: "https://demo.deallens.local/laptops/swift5",
    price: 799,
    ramGb: 16,
    storageGb: 512,
    cpu: "Intel Core Ultra 5",
  },
  {
    title: "Framework Laptop 13 — 16GB/512GB",
    link: "https://demo.deallens.local/laptops/framework13",
    price: 1049,
    ramGb: 16,
    storageGb: 512,
    cpu: "Intel Core Ultra 7",
  },
];

function source(hit: RawLaptopHit, i: number): SourceEvidence {
  return {
    id: `laptop-src-${i}`,
    sourceName: "DealLens laptop demo catalog",
    sourceUrl: hit.link,
    retrievedAt: new Date().toISOString(),
    evidenceType: "LISTING",
    extractionConfidence: 1,
    dataSource: "DEMO",
  };
}

export class LaptopResearchAdapter
  implements ResearchAdapter<LaptopResearchRequest, RawLaptopHit>
{
  readonly category = "LAPTOP" as const;

  async parseRequest(input: unknown): Promise<LaptopResearchRequest> {
    const body = input as {
      title?: string;
      price?: number;
      ramGb?: number;
    };
    const title = body.title?.trim() || "Target laptop";
    const price = Number(body.price) || 1000;
    const target: NormalizedOffer = {
      id: "offer-laptop-target",
      category: "LAPTOP",
      title,
      make: title.split(/\s+/)[0] ?? "Laptop",
      model: title,
      year: new Date().getFullYear(),
      price,
      source: {
        id: "laptop-target-src",
        sourceName: "Manual entry",
        sourceUrl: "https://deallens.local/manual-laptop",
        retrievedAt: new Date().toISOString(),
        evidenceType: "LISTING",
        extractionConfidence: 1,
        dataSource: "DEMO",
      },
    };
    return {
      category: "LAPTOP",
      rawQuery: `${title} $${price}`,
      target,
    };
  }

  async collectEvidence(request: LaptopResearchRequest): Promise<RawLaptopHit[]> {
    void request;
    return DEMO_LAPTOPS;
  }

  normalize(items: RawLaptopHit[]): NormalizedOffer[] {
    return items.map((hit, i) => ({
      id: `offer-laptop-${i}`,
      category: "LAPTOP" as const,
      title: hit.title,
      make: hit.title.split(/\s+/)[0] ?? "Laptop",
      model: hit.title,
      year: new Date().getFullYear(),
      price: hit.price,
      trim: `${hit.ramGb}GB/${hit.storageGb}GB · ${hit.cpu}`,
      condition: "NEW" as const,
      source: source(hit, i),
    }));
  }

  selectComparables(
    target: NormalizedOffer,
    candidates: NormalizedOffer[],
  ): ComparableSet {
    // Laptops: include all priced demo peers (no make/model gate).
    const included = candidates.filter((c) => c.id !== target.id && c.price > 0);
    const observations: PriceObservation[] = included.map((o) => ({
      id: `obs-${o.id}`,
      sourceId: o.source.id,
      offerId: o.id,
      price: o.price,
      observedAt: o.source.retrievedAt,
      currency: "USD",
      trim: o.trim,
    }));
    const prices = observations.map((o) => o.price);
    const { confidence, confidenceScore } = scoreConfidence(included.length, 0);
    return {
      targetId: target.id,
      included,
      observations,
      median: percentileValue(prices, 50),
      p25: percentileValue(prices, 25),
      p75: percentileValue(prices, 75),
      mean:
        prices.length === 0
          ? null
          : Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      sampleSize: prices.length,
      confidence,
      confidenceScore,
      exclusions: [],
      missingTrimCount: 0,
    };
  }
}

export const laptopResearchAdapter = new LaptopResearchAdapter();
