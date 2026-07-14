/**
 * Synthetic pricing dataset — the one DEMO-tagged source.
 *
 * There is no free API for real transaction prices, and we would rather
 * label a synthetic dataset loudly than fake realism (see README for
 * the methodology and for the adapter seam where a real source such as
 * Marketcheck would plug in). Every value produced here carries
 * `dataSource: "DEMO"` and the UI badges it wherever it appears.
 *
 * Generation is deterministic: the (make, model, year) triple seeds the
 * PRNG, so the same vehicle always gets the same market. Parameters:
 *  - Base price: $18k–$52k band chosen by seed, then depreciated ~11%
 *    per year of vehicle age relative to `asOf`.
 *  - Listings: 40–120 samples, normal-ish around the base price with a
 *    ~7% standard deviation (Box–Muller on the seeded PRNG).
 *  - History: 24 monthly medians = base price × mild depreciation drift
 *    × seasonal curve (spring tax-refund bump, late-summer clearance
 *    dip) × ±1.5% noise.
 *  - Events: model-year arrival each September, tax-refund season each
 *    March, plus 1–2 seeded incentive windows.
 *  - Honest-empty-state showcase: ~5% of vehicles (by seed) get a thin
 *    market (too few listings and months) so INSUFFICIENT_DATA and the
 *    "won't guess" UI are reachable in the demo.
 */
import type { DataSourceTag, MarketEvent, PricePoint } from "@/domain/types";

export interface PricingDataset {
  dataSource: DataSourceTag;
  /** Individual comparable listing prices, in dollars. */
  listings: number[];
  /** 24 months of median prices, oldest first. */
  history: PricePoint[];
  events: MarketEvent[];
}

/** xmur3 string hash — seeds the PRNG from a vehicle identity. */
function hashSeed(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 — small, fast, deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample via Box–Muller. */
function gaussian(rand: () => number): number {
  const u = Math.max(rand(), Number.EPSILON);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const HISTORY_MONTHS = 24;
const MONTHLY_DRIFT = -0.004; // gentle used-car depreciation per month

/** Seasonal multiplier by calendar month (1–12). */
function seasonality(month: number): number {
  // Tax-refund demand bump peaks in March; model-year clearance dips
  // prices in late summer / early fall.
  const taxBump = month === 3 || month === 4 ? 0.015 : 0;
  const clearanceDip = month === 8 || month === 9 ? -0.02 : 0;
  return 1 + taxBump + clearanceDip;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Walk back `offset` months from an "YYYY-MM" anchor. */
function shiftMonth(anchor: string, offset: number): { year: number; month: number } {
  const [y, m] = anchor.split("-").map(Number) as [number, number];
  const total = y * 12 + (m - 1) + offset;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

/**
 * Deterministically generate the demo market for one vehicle.
 *
 * @param asOf ISO "YYYY-MM" anchor for the history window. Passed in by
 *   the caller (never read from the clock here) so the generator stays
 *   a pure function.
 */
export function generatePricingDataset(
  make: string,
  model: string,
  year: number,
  asOf: string,
): PricingDataset {
  const seed = hashSeed(`${make.toLowerCase()}|${model.toLowerCase()}|${year}`);
  const rand = mulberry32(seed);

  // ~5% of vehicles get a deliberately thin market so the honest empty
  // state is demonstrable with real interaction, not just unit tests.
  const isThinMarket = seed % 20 === 0;

  const msrpBand = 18_000 + rand() * 34_000;
  const [asOfYear] = asOf.split("-").map(Number) as [number, number];
  const age = Math.max(0, asOfYear - year);
  const basePrice = msrpBand * Math.pow(0.89, age);

  const listingCount = isThinMarket ? 3 : 40 + Math.floor(rand() * 81);
  const listings = Array.from({ length: listingCount }, () =>
    Math.round(basePrice * (1 + gaussian(rand) * 0.07)),
  );

  const historyLength = isThinMarket ? 3 : HISTORY_MONTHS;
  const history: PricePoint[] = [];
  for (let i = historyLength - 1; i >= 0; i--) {
    const { year: y, month: m } = shiftMonth(asOf, -i);
    const drift = Math.pow(1 + MONTHLY_DRIFT, historyLength - 1 - i);
    const noise = 1 + (rand() - 0.5) * 0.03;
    history.push({
      month: monthKey(y, m),
      price: Math.round(basePrice * drift * seasonality(m) * noise),
    });
  }

  const events: MarketEvent[] = [];
  for (let i = HISTORY_MONTHS - 1; i >= 0; i--) {
    const { year: y, month: m } = shiftMonth(asOf, -i);
    if (m === 9) {
      events.push({
        month: monthKey(y, m),
        title: `${y + 1} model year arrives at dealers`,
        kind: "MODEL_YEAR",
      });
    }
    if (m === 3) {
      events.push({
        month: monthKey(y, m),
        title: "Tax refund season demand bump",
        kind: "SEASONAL",
      });
    }
  }
  // 1–2 seeded manufacturer incentive windows at stable offsets.
  const incentiveCount = 1 + (seed % 2);
  for (let i = 0; i < incentiveCount; i++) {
    const offset = -(3 + Math.floor(rand() * (HISTORY_MONTHS - 6)));
    const { year: y, month: m } = shiftMonth(asOf, offset);
    events.push({
      month: monthKey(y, m),
      title: "Manufacturer incentive program",
      kind: "INCENTIVE",
    });
  }
  events.sort((a, b) => a.month.localeCompare(b.month));

  return {
    dataSource: "DEMO",
    listings,
    history,
    events: isThinMarket ? [] : events,
  };
}
