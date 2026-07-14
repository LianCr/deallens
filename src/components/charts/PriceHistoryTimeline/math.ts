/**
 * Timeline math — pure functions only, ported from smart-money-decoder's
 * GodModeTimeline and re-cut for monthly car-price data. React renders,
 * D3 computes; everything here runs identically on server and client.
 */
import { scaleTime, scaleLinear, type ScaleTime, type ScaleLinear } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import { focusDomain } from "@/domain/focusDomain";
import { clusterEventsByMonth } from "@/domain/clusterEvents";
import type { EventCluster, MarketEvent, PricePoint } from "@/domain/types";

export interface TimelineGeometry {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
}

export const TIMELINE_GEOMETRY: TimelineGeometry = {
  width: 720,
  height: 280,
  margin: { top: 18, right: 48, bottom: 26, left: 8 },
};

/** Sweep this close to a cluster dot (in viewBox units) and it activates. */
export const SNAP_DISTANCE = 26;

export type RangeKey = "6" | "12" | "24";
export const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "6", label: "6M" },
  { key: "12", label: "12M" },
  { key: "24", label: "24M" },
];

export interface PositionedCluster extends EventCluster {
  /** x/y in plot coordinates, pinned to the price at that month. */
  x: number;
  y: number;
  price: number;
}

export interface TimelineShape {
  points: PricePoint[];
  x: ScaleTime<number, number>;
  y: ScaleLinear<number, number>;
  linePath: string;
  areaPath: string;
  clusters: PositionedCluster[];
  /** Price direction across the window: rising = true. */
  rising: boolean;
  plotWidth: number;
  plotHeight: number;
  xTicks: Date[];
  yTicks: number[];
}

export const monthToDate = (month: string): Date => new Date(`${month}-01T00:00:00Z`);

/** "2025-03" → "Mar 25" for axis ticks. */
export function formatMonth(date: Date): string {
  return `${date.toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${String(
    date.getUTCFullYear(),
  ).slice(2)}`;
}

/** Compact dollars for the y axis: $29.5k. */
export function formatShortDollars(value: number): string {
  if (Math.abs(value) >= 10_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

/** Slice the last N months of the series for the range switch. */
export function sliceRange(points: readonly PricePoint[], range: RangeKey): PricePoint[] {
  const n = Number(range);
  return points.slice(-Math.max(n, 2));
}

/**
 * Build every coordinate the timeline needs. Returns null when the
 * series is too thin to draw honestly (fewer than 2 points).
 */
export function buildTimelineShape(
  allPoints: readonly PricePoint[],
  events: readonly MarketEvent[],
  range: RangeKey,
  geometry: TimelineGeometry = TIMELINE_GEOMETRY,
): TimelineShape | null {
  const points = sliceRange(allPoints, range);
  if (points.length < 2) return null;

  const { width, height, margin } = geometry;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const dates = points.map((p) => monthToDate(p.month));
  const x = scaleTime()
    .domain([dates[0]!, dates.at(-1)!])
    .range([0, plotWidth]);

  // Focus the y axis on the data's own band — a series moving within a
  // few percent must not be flattened against a zero baseline.
  const domain = focusDomain(points.map((p) => p.price)) ?? [0, 1];
  const y = scaleLinear().domain(domain).range([plotHeight, 0]);

  const lineGen = line<PricePoint>()
    .x((p) => x(monthToDate(p.month)))
    .y((p) => y(p.price))
    .curve(curveMonotoneX);
  const areaGen = area<PricePoint>()
    .x((p) => x(monthToDate(p.month)))
    .y0(plotHeight)
    .y1((p) => y(p.price))
    .curve(curveMonotoneX);

  const priceByMonth = new Map(points.map((p) => [p.month, p.price]));
  const visibleMonths = new Set(points.map((p) => p.month));
  const clusters = clusterEventsByMonth(
    events.filter((e) => visibleMonths.has(e.month)),
  ).map((cluster) => {
    const price = priceByMonth.get(cluster.month)!;
    return {
      ...cluster,
      price,
      x: x(monthToDate(cluster.month)),
      y: y(price),
    };
  });

  return {
    points,
    x,
    y,
    linePath: lineGen(points) ?? "",
    areaPath: areaGen(points) ?? "",
    clusters,
    rising: points.at(-1)!.price >= points[0]!.price,
    plotWidth,
    plotHeight,
    xTicks: x.ticks(Math.min(6, points.length)),
    yTicks: y.ticks(4),
  };
}

/** Index of the series point nearest to a plot-space x position. */
export function nearestIndex(shape: TimelineShape, plotX: number): number {
  const target = shape.x.invert(plotX).getTime();
  let best = 0;
  shape.points.forEach((p, i) => {
    if (
      Math.abs(monthToDate(p.month).getTime() - target) <
      Math.abs(monthToDate(shape.points[best]!.month).getTime() - target)
    ) {
      best = i;
    }
  });
  return best;
}

/**
 * The cluster within snapping distance of a series index, or null.
 * Sweeping "near" a dot activates it — discoverability over precision.
 */
export function snappedCluster(
  shape: TimelineShape,
  index: number,
): PositionedCluster | null {
  const cx = shape.x(monthToDate(shape.points[index]!.month));
  let best: PositionedCluster | null = null;
  let bestDistance = Infinity;
  for (const cluster of shape.clusters) {
    const distance = Math.abs(cluster.x - cx);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = cluster;
    }
  }
  return bestDistance <= SNAP_DISTANCE ? best : null;
}
