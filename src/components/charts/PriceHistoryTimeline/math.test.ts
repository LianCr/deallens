import { describe, expect, test } from "vitest";
import type { MarketEvent, PricePoint } from "@/domain/types";
import {
  buildTimelineShape,
  nearestIndex,
  sliceRange,
  snappedCluster,
  SNAP_DISTANCE,
} from "./math";

const history: PricePoint[] = Array.from({ length: 24 }, (_, i) => {
  const month = `${2024 + Math.floor((7 + i) / 12)}-${String(((7 + i) % 12) + 1).padStart(2, "0")}`;
  return { month, price: 30000 - i * 100 };
});

const events: MarketEvent[] = [
  { month: history[3]!.month, title: "Tax refund season", kind: "SEASONAL" },
  { month: history[3]!.month, title: "Incentive program", kind: "INCENTIVE" },
  { month: history[20]!.month, title: "New model year", kind: "MODEL_YEAR" },
];

describe("buildTimelineShape", () => {
  test("returns null when the series is too thin to be honest", () => {
    expect(buildTimelineShape([], events, "24")).toBeNull();
    expect(buildTimelineShape(history.slice(0, 1), events, "24")).toBeNull();
  });

  test("y domain focuses on the data band, not zero", () => {
    const shape = buildTimelineShape(history, events, "24")!;
    const [lo, hi] = shape.y.domain() as [number, number];
    expect(lo).toBeGreaterThan(20000); // never flattened against $0
    expect(hi).toBeGreaterThan(30000 - 0.0001);
  });

  test("marks direction: falling prices in this fixture", () => {
    expect(buildTimelineShape(history, events, "24")!.rising).toBe(false);
  });

  test("clusters same-month events into one dot with the right count", () => {
    const shape = buildTimelineShape(history, events, "24")!;
    expect(shape.clusters).toHaveLength(2);
    expect(shape.clusters[0]!.count).toBe(2);
  });

  test("range slicing drops clusters that fall outside the window", () => {
    const shape = buildTimelineShape(history, events, "6")!;
    expect(shape.points).toHaveLength(6);
    // Only the model-year event (index 20) is inside the last 6 months.
    expect(shape.clusters).toHaveLength(1);
    expect(shape.clusters[0]!.events[0]!.kind).toBe("MODEL_YEAR");
  });
});

describe("sliceRange", () => {
  test("keeps at least two points even for absurd ranges", () => {
    expect(sliceRange(history.slice(0, 2), "6")).toHaveLength(2);
  });
});

describe("nearestIndex / snappedCluster", () => {
  const shape = buildTimelineShape(history, events, "24")!;

  test("nearestIndex snaps plot x to the closest month", () => {
    expect(nearestIndex(shape, 0)).toBe(0);
    expect(nearestIndex(shape, shape.plotWidth)).toBe(history.length - 1);
  });

  test("sweeping onto a cluster month activates it", () => {
    expect(snappedCluster(shape, 3)?.month).toBe(history[3]!.month);
  });

  test("sweeping far from every cluster activates nothing", () => {
    // Index 12 is ~9 months from either cluster — way past SNAP_DISTANCE.
    const cluster = snappedCluster(shape, 12);
    const cx = shape.x(new Date(`${history[12]!.month}-01T00:00:00Z`));
    const distances = shape.clusters.map((c) => Math.abs(c.x - cx));
    expect(Math.min(...distances)).toBeGreaterThan(SNAP_DISTANCE);
    expect(cluster).toBeNull();
  });
});
