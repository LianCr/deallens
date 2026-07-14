/**
 * All chart math lives here as pure functions — D3 computes, React (or
 * the server) renders. Nothing in this file touches the DOM, so every
 * bit of it is unit-testable and runs identically on server and client.
 */
import { scaleLinear, type ScaleLinear } from "d3-scale";
import { area, curveBasis, line } from "d3-shape";
import { max } from "d3-array";
import type { PriceBucket } from "@/domain/types";

export interface ChartGeometry {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
}

export const DEFAULT_GEOMETRY: ChartGeometry = {
  width: 720,
  height: 260,
  margin: { top: 18, right: 16, bottom: 28, left: 16 },
};

export interface DistributionShape {
  x: ScaleLinear<number, number>;
  y: ScaleLinear<number, number>;
  /** Smoothed density outline of the distribution. */
  areaPath: string;
  linePath: string;
}

/**
 * Turn histogram buckets into a smoothed density silhouette.
 * Curve smoothing (curveBasis) is presentation only — markers and
 * percentiles are computed from the raw buckets, never from the curve.
 */
export function buildDistributionShape(
  buckets: readonly PriceBucket[],
  geometry: ChartGeometry = DEFAULT_GEOMETRY,
): DistributionShape | null {
  if (buckets.length === 0) return null;
  const { width, height, margin } = geometry;
  const first = buckets[0]!;
  const last = buckets.at(-1)!;

  const x = scaleLinear()
    .domain([first.lo, last.hi])
    .range([margin.left, width - margin.right]);
  const y = scaleLinear()
    .domain([0, max(buckets, (b) => b.count) ?? 1])
    .range([height - margin.bottom, margin.top]);

  const points: Array<[number, number]> = [
    [first.lo, 0],
    ...buckets.map((b): [number, number] => [(b.lo + b.hi) / 2, b.count]),
    [last.hi, 0],
  ];

  const areaGen = area<[number, number]>()
    .x((d) => x(d[0]))
    .y0(y(0))
    .y1((d) => y(d[1]))
    .curve(curveBasis);
  const lineGen = line<[number, number]>()
    .x((d) => x(d[0]))
    .y((d) => y(d[1]))
    .curve(curveBasis);

  return {
    x,
    y,
    areaPath: areaGen(points) ?? "",
    linePath: lineGen(points) ?? "",
  };
}

/**
 * Percentile of a price against the bucketed distribution: cumulative
 * count below the bucket plus linear interpolation inside it. Matches
 * the honest convention of percentileRank closely enough for a hover
 * readout over demo data.
 */
export function percentileFromBuckets(
  buckets: readonly PriceBucket[],
  price: number,
): number | null {
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  if (total === 0) return null;
  const first = buckets[0]!;
  const last = buckets.at(-1)!;
  if (price <= first.lo) return 0;
  if (price >= last.hi) return 100;
  let below = 0;
  for (const bucket of buckets) {
    if (price >= bucket.hi) {
      below += bucket.count;
    } else if (price >= bucket.lo) {
      const fraction = (price - bucket.lo) / (bucket.hi - bucket.lo || 1);
      below += bucket.count * fraction;
      break;
    } else {
      break;
    }
  }
  return (below / total) * 100;
}

/** Format a dollar amount for axis labels and readouts. */
export const formatDollars = (value: number): string =>
  `$${Math.round(value).toLocaleString("en-US")}`;
