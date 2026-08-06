/**
 * Listing collector — one controlled upstream for comparable vehicle
 * offers. Live path uses SerpAPI (Google) when LISTING_SEARCH_API_KEY
 * or SERPAPI_API_KEY is set; otherwise DEMO fallback (honest badge).
 *
 * This is product-price search, not the AI webSearch tool (recalls /
 * incentives). See docs/adr/008-listing-collector.md.
 */

import { fetchUpstream, UpstreamError } from "@/sources/errors";
import { generatePricingDataset } from "@/sources/pricing-gen";
import type { NormalizedOffer, SourceEvidence } from "../types";

export interface RawListingHit {
  title: string;
  link: string;
  snippet: string;
  sourceName: string;
  retrievedAt: string;
  /** Parsed fields when extractable from title/snippet. */
  price?: number;
  year?: number;
  make?: string;
  model?: string;
  mileage?: number;
  location?: string;
}

export interface ListingCollector {
  readonly mode: "LIVE_SEARCH" | "DEMO_FALLBACK";
  collect(query: {
    make: string;
    model: string;
    year: number;
    location?: string;
  }): Promise<RawListingHit[]>;
}

function apiKey(): string | undefined {
  return (
    process.env.LISTING_SEARCH_API_KEY?.trim() ||
    process.env.SERPAPI_API_KEY?.trim() ||
    undefined
  );
}

export function listingCollectorAvailable(): boolean {
  return Boolean(apiKey()) || process.env.MOCK_LISTING_SEARCH === "1";
}

/** Parse $12,500 / 12500 from title or snippet. */
export function extractPrice(text: string): number | undefined {
  const m = text.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
  if (!m?.[1]) return undefined;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 500 || n > 5_000_000) return undefined;
  return Math.round(n);
}

/** Parse mileage like 45,000 miles / 45k mi. */
export function extractMileage(text: string): number | undefined {
  const m =
    text.match(/([\d,]+)\s*(?:miles|mile|mi)\b/i) ||
    text.match(/([\d.]+)\s*k\s*(?:miles|mi)\b/i);
  if (!m?.[1]) return undefined;
  let n = Number(m[1].replace(/,/g, ""));
  if (/k\s*(?:miles|mi)/i.test(text) && n < 1000) n *= 1000;
  if (!Number.isFinite(n) || n < 0 || n > 800_000) return undefined;
  return Math.round(n);
}

export function extractYear(text: string, fallback: number): number {
  const m = text.match(/\b(20[0-2]\d|19\d{2})\b/);
  if (!m) return fallback;
  const y = Number(m[1]);
  return y >= 1980 && y <= 2035 ? y : fallback;
}

interface SerpOrganic {
  title?: string;
  link?: string;
  snippet?: string;
  source?: string;
}

interface SerpResponse {
  organic_results?: SerpOrganic[];
  error?: string;
}

/**
 * Live SerpAPI Google collector — returns real result URLs the user
 * can open. Field extraction is best-effort from title/snippet.
 */
export const serpApiListingCollector: ListingCollector = {
  mode: "LIVE_SEARCH",
  async collect({ make, model, year, location }) {
    if (process.env.MOCK_LISTING_SEARCH === "1") {
      return loadFixtureHits(make, model, year);
    }
    const key = apiKey();
    if (!key) {
      throw new UpstreamError(
        "HTTP",
        "serpapi",
        "LISTING_SEARCH_API_KEY / SERPAPI_API_KEY not configured",
      );
    }
    const q = [
      `used ${year} ${make} ${model} for sale`,
      location ? `near ${location}` : "",
      "price",
    ]
      .filter(Boolean)
      .join(" ");
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", q);
    url.searchParams.set("api_key", key);
    url.searchParams.set("num", "20");

    const res = await fetchUpstream("serpapi", url.toString());
    let body: SerpResponse;
    try {
      body = (await res.json()) as SerpResponse;
    } catch {
      throw new UpstreamError("FORMAT", "serpapi", "response was not JSON");
    }
    if (body.error) {
      throw new UpstreamError("HTTP", "serpapi", body.error);
    }
    const retrievedAt = new Date().toISOString();
    const hits: RawListingHit[] = [];
    for (const row of body.organic_results ?? []) {
      if (!row.link || !row.title) continue;
      const blob = `${row.title} ${row.snippet ?? ""}`;
      hits.push({
        title: row.title,
        link: row.link,
        snippet: row.snippet ?? "",
        sourceName: row.source ?? hostnameOf(row.link),
        retrievedAt,
        price: extractPrice(blob),
        year: extractYear(blob, year),
        make,
        model,
        mileage: extractMileage(blob),
      });
    }
    return hits;
  },
};

function hostnameOf(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
}

/** Fixture path used by MOCK_LISTING_SEARCH and contract tests. */
export async function loadFixtureHits(
  make: string,
  model: string,
  year: number,
): Promise<RawListingHit[]> {
  const { serpListingFixture } = await import("@/fixtures/research/serp-listings");
  const retrievedAt = new Date().toISOString();
  return serpListingFixture(make, model, year, retrievedAt);
}

/**
 * DEMO fallback — deterministic prices from pricing-gen, wrapped as
 * citable demo URLs so the pipeline shape matches live search.
 * Every hit is DataSource DEMO via normalize().
 */
export const demoListingCollector: ListingCollector = {
  mode: "DEMO_FALLBACK",
  async collect({ make, model, year }) {
    const asOf = new Date().toISOString().slice(0, 7);
    const dataset = generatePricingDataset(make, model, year, asOf);
    const retrievedAt = new Date().toISOString();
    const prices = dataset.listings.slice(0, 16);
    return prices.map((price, i) => {
      const mileage = 18_000 + ((i * 7_337) % 60_000);
      const title = `${year} ${make} ${model} — $${price.toLocaleString("en-US")} · ${mileage.toLocaleString("en-US")} mi (demo listing)`;
      const link = `https://demo.deallens.local/listings/${encodeURIComponent(make)}-${year}-${encodeURIComponent(model)}-${i + 1}`;
      return {
        title,
        link,
        snippet: `Demo comparable #${i + 1} for ${year} ${make} ${model}. Not a live marketplace listing.`,
        sourceName: "DealLens demo catalog",
        retrievedAt,
        price,
        year,
        make,
        model,
        mileage,
        location: "Demo City, USA",
      } satisfies RawListingHit;
    });
  },
};

/** Active collector: live when keyed/mocked, else demo fallback. */
export function activeListingCollector(): ListingCollector {
  if (apiKey() || process.env.MOCK_LISTING_SEARCH === "1") {
    return serpApiListingCollector;
  }
  return demoListingCollector;
}

export function rawHitsToSourceEvidence(hit: RawListingHit, index: number): SourceEvidence {
  const isDemo = hit.sourceName.includes("demo") || hit.link.includes("demo.deallens.local");
  return {
    id: `src-${index}-${hashShort(hit.link)}`,
    sourceName: hit.sourceName,
    sourceUrl: hit.link,
    retrievedAt: hit.retrievedAt,
    evidenceType: "LISTING",
    extractionConfidence: hit.price != null ? 0.75 : 0.4,
    dataSource: isDemo ? "DEMO" : "SEARCH_EXTRACTED",
  };
}

function hashShort(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).slice(0, 8);
}

export function rawHitsToOffers(
  hits: RawListingHit[],
  fallback: { make: string; model: string; year: number },
): NormalizedOffer[] {
  const offers: NormalizedOffer[] = [];
  hits.forEach((hit, i) => {
    if (hit.price == null) return;
    const source = rawHitsToSourceEvidence(hit, i);
    offers.push({
      id: `offer-${source.id}`,
      category: "VEHICLE",
      title: hit.title,
      make: hit.make ?? fallback.make,
      model: hit.model ?? fallback.model,
      year: hit.year ?? fallback.year,
      price: hit.price,
      mileage: hit.mileage,
      location: hit.location,
      condition: "USED",
      source,
    });
  });
  return offers;
}
