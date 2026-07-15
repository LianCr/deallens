import type { MarketEvent, PricePoint, Verdict, DataSourceTag } from "@/domain/types";

/**
 * The grounding pipeline for the AI deal brief.
 *
 * "AI narrates, math decides": every number the model is allowed to
 * mention is computed here — by the same pure domain layer the page
 * renders — and compressed into one compact FACTS block. The system
 * prompt forbids the model from computing or inventing figures, so this
 * file is the complete inventory of what it may say.
 *
 * Pure function: same inputs, same facts. Unit-tested and snapshotted.
 */

export interface FuelFactsInput {
  annualCost: number;
  combinedMpg: number;
  milesPerYear: number;
  dollarsPerGallon: number;
}

export interface DealFactsInput {
  vehicleName: string;
  quote: number;
  verdict: Verdict;
  percentile: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  history: PricePoint[];
  events: MarketEvent[];
  dataSource: DataSourceTag;
  fuel: FuelFactsInput | null;
}

export interface TrendFacts {
  months: number;
  startMonth: string;
  startPrice: number;
  endMonth: string;
  endPrice: number;
  changeDollars: number;
  changePercent: number;
  lowest: PricePoint;
  highest: PricePoint;
}

export interface DealFacts {
  vehicle: string;
  quoteDollars: number;
  verdict: Verdict;
  /** True when the market is too thin to judge — the brief must say so. */
  insufficientData: boolean;
  /** "DEMO" pricing is the synthetic dataset; the brief must not oversell it. */
  pricingDataSource: DataSourceTag;
  percentile: number | null;
  p25Dollars: number | null;
  medianDollars: number | null;
  p75Dollars: number | null;
  /** quote − median; negative means below the market median. */
  deltaFromMedianDollars: number | null;
  trend24Months: TrendFacts | null;
  marketEvents: Array<{ month: string; title: string; kind: MarketEvent["kind"] }>;
  annualFuel: {
    costDollars: number;
    combinedMpg: number;
    assumedMilesPerYear: number;
    assumedDollarsPerGallon: number;
  } | null;
}

/** Events beyond this count add tokens without adding negotiation signal. */
const MAX_EVENTS = 8;

function buildTrend(history: PricePoint[]): TrendFacts | null {
  if (history.length < 2) return null;
  const first = history[0]!;
  const last = history[history.length - 1]!;
  let lowest = first;
  let highest = first;
  for (const point of history) {
    if (point.price < lowest.price) lowest = point;
    if (point.price > highest.price) highest = point;
  }
  const changeDollars = Math.round(last.price - first.price);
  const changePercent =
    first.price > 0 ? Math.round(((last.price - first.price) / first.price) * 1000) / 10 : 0;
  return {
    months: history.length,
    startMonth: first.month,
    startPrice: Math.round(first.price),
    endMonth: last.month,
    endPrice: Math.round(last.price),
    changeDollars,
    changePercent,
    lowest: { month: lowest.month, price: Math.round(lowest.price) },
    highest: { month: highest.month, price: Math.round(highest.price) },
  };
}

export function buildDealFacts(input: DealFactsInput): DealFacts {
  const insufficientData = input.verdict === "INSUFFICIENT_DATA" || input.median === null;
  return {
    vehicle: input.vehicleName,
    quoteDollars: Math.round(input.quote),
    verdict: input.verdict,
    insufficientData,
    pricingDataSource: input.dataSource,
    percentile: input.percentile === null ? null : Math.round(input.percentile),
    p25Dollars: input.p25 === null ? null : Math.round(input.p25),
    medianDollars: input.median === null ? null : Math.round(input.median),
    p75Dollars: input.p75 === null ? null : Math.round(input.p75),
    deltaFromMedianDollars:
      input.median === null ? null : Math.round(input.quote - input.median),
    trend24Months: insufficientData ? null : buildTrend(input.history),
    marketEvents: input.events
      .slice(0, MAX_EVENTS)
      .map(({ month, title, kind }) => ({ month, title, kind })),
    annualFuel: input.fuel
      ? {
          costDollars: Math.round(input.fuel.annualCost),
          combinedMpg: input.fuel.combinedMpg,
          assumedMilesPerYear: input.fuel.milesPerYear,
          assumedDollarsPerGallon: input.fuel.dollarsPerGallon,
        }
      : null,
  };
}

/** The exact string handed to the model as its only source of numbers. */
export function factsBlock(facts: DealFacts): string {
  return JSON.stringify(facts, null, 1);
}
