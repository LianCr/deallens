import { executeGraphQL } from "@/graphql/yoga";
import { buildDealFacts, type DealFacts } from "@/ai/dealFacts";
import { titleCase } from "@/lib/vehicleUrl";
import {
  annualFuelCost,
  DEFAULT_DOLLARS_PER_GALLON,
  DEFAULT_MILES_PER_YEAR,
} from "@/domain/fuelCost";
import type { MarketEvent, PriceBucket, PricePoint, Verdict } from "@/domain/types";

/**
 * Shared grounding loader for the AI routes (/api/deal-brief and
 * /api/deal-ask). Given only the four deal identifiers, it recomputes
 * the PriceContext in-process through the same GraphQL gateway the page
 * uses and compresses the result into the FACTS block input. Client-
 * supplied numbers never reach a prompt — every AI feature grounds
 * through this one path.
 *
 * Pure orchestration: no caching, no rate limiting, no HTTP concerns —
 * those stay in the routes. Throws when the pricing context can't be
 * computed; callers map that to their 502.
 */

export interface DealIdentifiers {
  make: string;
  year: number;
  model: string;
  quote: number;
}

interface PriceContextData {
  quote: number;
  verdict: Verdict;
  percentile: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  distribution: PriceBucket[];
  history: PricePoint[];
  events: MarketEvent[];
  dataSource: "REAL" | "DEMO";
}

export async function loadDealFacts({
  make,
  year,
  model,
  quote,
}: DealIdentifiers): Promise<DealFacts> {
  // Fuel economy is a best-effort enrichment: when fueleconomy.gov can't
  // match the vehicle, the facts simply omit fuel (honest degradation).
  const [{ priceContext }, fuelEconomy] = await Promise.all([
    executeGraphQL<{ priceContext: PriceContextData }>(
      `query BriefDeal($make: String!, $model: String!, $year: Int!, $quote: Int!) {
        priceContext(make: $make, model: $model, year: $year, quote: $quote) {
          quote verdict percentile p25 median p75
          distribution { lo hi count }
          history { month price }
          events { month title kind }
          dataSource
        }
      }`,
      { make, model, year, quote },
    ),
    executeGraphQL<{ fuelEconomy: { combinedMpg: number } | null }>(
      `query BriefFuel($make: String!, $model: String!, $year: Int!) {
        fuelEconomy(make: $make, model: $model, year: $year) { combinedMpg }
      }`,
      { make, model, year },
    ).then(
      (data) => data.fuelEconomy,
      () => null,
    ),
  ]);

  const fuelCost = fuelEconomy ? annualFuelCost({ combinedMpg: fuelEconomy.combinedMpg }) : null;
  return buildDealFacts({
    vehicleName: `${year} ${titleCase(make)} ${titleCase(model)}`,
    quote: priceContext.quote,
    verdict: priceContext.verdict,
    percentile: priceContext.percentile,
    p25: priceContext.p25,
    median: priceContext.median,
    p75: priceContext.p75,
    history: priceContext.history,
    events: priceContext.events,
    dataSource: priceContext.dataSource,
    fuel:
      fuelEconomy && fuelCost !== null
        ? {
            annualCost: fuelCost,
            combinedMpg: fuelEconomy.combinedMpg,
            milesPerYear: DEFAULT_MILES_PER_YEAR,
            dollarsPerGallon: DEFAULT_DOLLARS_PER_GALLON,
          }
        : null,
  });
}
