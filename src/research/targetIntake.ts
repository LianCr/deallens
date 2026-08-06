/**
 * Target intake — manual fields or listing URL parse.
 * URL fetch extracts JSON-LD Product/Offer and obvious price patterns;
 * failures return null so the UI can fall back to the manual form.
 */

import { z } from "zod";
import { fetchUpstream, UpstreamError } from "@/sources/errors";
import type { ManualVehicleInput, NormalizedOffer, SourceEvidence } from "./types";
import { extractMileage, extractPrice, extractYear } from "./collectors/listingCollector";
import { inferTrim } from "./comparables";

export const ManualVehicleSchema = z.object({
  make: z.string().trim().min(1).max(40),
  model: z.string().trim().min(1).max(60),
  year: z.number().int().min(1980).max(2035),
  price: z.number().int().min(500).max(5_000_000),
  mileage: z.number().int().min(0).max(800_000).optional(),
  location: z.string().trim().max(80).optional(),
  trim: z.string().trim().max(40).optional(),
  listingUrl: z.string().trim().max(2000).optional(),
});

export function manualToTarget(input: ManualVehicleInput): NormalizedOffer {
  const retrievedAt = new Date().toISOString();
  const url = input.listingUrl?.trim() || "https://deallens.local/manual-entry";
  const source: SourceEvidence = {
    id: "src-target-manual",
    sourceName: input.listingUrl ? hostname(url) : "Manual entry",
    sourceUrl: url,
    retrievedAt,
    evidenceType: "LISTING",
    extractionConfidence: 1,
    dataSource: input.listingUrl ? "SEARCH_EXTRACTED" : "DEMO",
  };
  return {
    id: "offer-target",
    category: "VEHICLE",
    title: `${input.year} ${input.make} ${input.model}${input.trim ? ` ${input.trim}` : ""}`,
    make: input.make,
    model: input.model,
    year: input.year,
    trim: input.trim,
    price: input.price,
    mileage: input.mileage,
    location: input.location,
    condition: "USED",
    source,
  };
}

function hostname(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "listing";
  }
}

export interface UrlParseResult {
  partial: Partial<ManualVehicleInput> & { listingUrl: string };
  warnings: string[];
}

/**
 * Fetch a listing URL and pull structured fields. Many dealer sites
 * block bots — callers must treat null/partial as editable drafts.
 */
export async function parseListingUrl(listingUrl: string): Promise<UrlParseResult | null> {
  let html: string;
  try {
    const res = await fetchUpstream(
      "listing-url",
      listingUrl,
      {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "DealLensResearchBot/0.1 (+https://github.com/LianCr/deallens)",
        },
      },
      10_000,
    );
    html = await res.text();
  } catch (err) {
    if (err instanceof UpstreamError) return null;
    return null;
  }

  const warnings: string[] = [];
  const partial: Partial<ManualVehicleInput> & { listingUrl: string } = {
    listingUrl,
  };

  const jsonLd = extractJsonLdProduct(html);
  if (jsonLd) {
    if (jsonLd.name) {
      const parsed = parseVehicleName(jsonLd.name);
      Object.assign(partial, parsed);
    }
    if (jsonLd.price != null) partial.price = jsonLd.price;
    if (jsonLd.mileage != null) partial.mileage = jsonLd.mileage;
  }

  const blob = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
  if (partial.price == null) {
    const p = extractPrice(blob.slice(0, 50_000));
    if (p != null) partial.price = p;
    else warnings.push("Could not find a clear asking price on the page.");
  }
  if (partial.mileage == null) {
    const mi = extractMileage(blob.slice(0, 50_000));
    if (mi != null) partial.mileage = mi;
  }
  if (partial.year == null) {
    partial.year = extractYear(blob.slice(0, 20_000), new Date().getFullYear() - 3);
    warnings.push("Year was inferred — please confirm.");
  }
  if (!partial.make || !partial.model) {
    warnings.push("Make/model incomplete — fill in manually before analyzing.");
  }

  return { partial, warnings };
}

function extractJsonLdProduct(html: string): {
  name?: string;
  price?: number;
  mileage?: number;
} | null {
  const blocks = html.match(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  if (!blocks) return null;
  for (const block of blocks) {
    const raw = block.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "");
    try {
      const data = JSON.parse(raw) as unknown;
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const n = node as Record<string, unknown>;
        const type = String(n["@type"] ?? "");
        if (!/product|car|vehicle/i.test(type) && !n.offers) continue;
        const name = typeof n.name === "string" ? n.name : undefined;
        let price: number | undefined;
        const offers = n.offers as Record<string, unknown> | undefined;
        if (
          offers &&
          (typeof offers.price === "string" || typeof offers.price === "number")
        ) {
          price = Math.round(Number(offers.price));
        }
        let mileage: number | undefined;
        const mileageFrom = n.mileageFromOdometer as Record<string, unknown> | undefined;
        if (mileageFrom && mileageFrom.value != null) {
          mileage = Math.round(Number(mileageFrom.value));
        }
        return { name, price, mileage };
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return null;
}

function parseVehicleName(name: string): Partial<ManualVehicleInput> {
  const year = extractYear(name, 0) || undefined;
  const trim = inferTrim(name, "");
  const parts = name.replace(/[^\w\s-]/g, " ").trim().split(/\s+/);
  // Heuristic: Year Make Model…
  let make: string | undefined;
  let model: string | undefined;
  if (parts.length >= 3 && parts[0] && /^\d{4}$/.test(parts[0])) {
    make = parts[1];
    model = parts.slice(2, 4).join(" ");
  }
  return {
    year: year && year >= 1980 ? year : undefined,
    make,
    model,
    trim,
  };
}
