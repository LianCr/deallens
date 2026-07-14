import { describe, expect, test } from "vitest";
import { clusterEventsByMonth } from "./clusterEvents";
import type { MarketEvent } from "./types";

const event = (month: string, title: string): MarketEvent => ({
  month,
  title,
  kind: "SEASONAL",
});

describe("clusterEventsByMonth", () => {
  test("empty input produces no clusters", () => {
    expect(clusterEventsByMonth([])).toEqual([]);
  });

  test("groups same-month events into one cluster with a count", () => {
    const clusters = clusterEventsByMonth([
      event("2025-03", "Tax refund demand bump"),
      event("2025-03", "End-of-quarter incentives"),
      event("2025-09", "New model year arrives"),
    ]);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]).toMatchObject({ month: "2025-03", count: 2 });
    expect(clusters[1]).toMatchObject({ month: "2025-09", count: 1 });
  });

  test("clusters are sorted by month even when input is not", () => {
    const clusters = clusterEventsByMonth([
      event("2025-12", "Holiday sales event"),
      event("2024-06", "End-of-quarter incentives"),
    ]);
    expect(clusters.map((c) => c.month)).toEqual(["2024-06", "2025-12"]);
  });

  test("events inside a cluster keep input order", () => {
    const clusters = clusterEventsByMonth([
      event("2025-03", "first"),
      event("2025-03", "second"),
    ]);
    expect(clusters[0]!.events.map((e) => e.title)).toEqual(["first", "second"]);
  });
});
