/**
 * Domain types shared across the pure-function layer, the data sources,
 * and the GraphQL schema. No runtime code in this file.
 */

/** One month of price history. `month` is an ISO "YYYY-MM" key. */
export interface PricePoint {
  month: string;
  price: number;
}

/** A market event pinned to the price timeline. */
export interface MarketEvent {
  /** ISO "YYYY-MM" month the event lands in. */
  month: string;
  title: string;
  kind: "MODEL_YEAR" | "SEASONAL" | "INCENTIVE";
}

/** Events grouped by month for cluster dots on the timeline. */
export interface EventCluster {
  month: string;
  count: number;
  events: MarketEvent[];
}

/** One bar of the market price distribution histogram. */
export interface PriceBucket {
  /** Inclusive lower bound of the bucket, in dollars. */
  lo: number;
  /** Exclusive upper bound (inclusive for the last bucket). */
  hi: number;
  count: number;
}

export type Verdict =
  | "GREAT_DEAL"
  | "FAIR"
  | "ABOVE_MARKET"
  | "INSUFFICIENT_DATA";

/**
 * Data honesty, encoded in the type system: everything user-facing that
 * carries numbers must say whether they came from a real API or the
 * synthetic demo dataset.
 */
export type DataSourceTag = "REAL" | "DEMO";
