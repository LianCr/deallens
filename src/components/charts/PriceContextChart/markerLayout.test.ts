import { describe, expect, test } from "vitest";
import {
  DEFAULT_GEOMETRY,
  formatDollars,
  quoteMarkerLayout,
} from "./markerLayout";

const { width, margin } = DEFAULT_GEOMETRY;
const plotLeft = margin.left;
const plotRight = width - margin.right;

describe("quoteMarkerLayout", () => {
  test("interpolates linearly across the plot area", () => {
    const mid = quoteMarkerLayout(25_000, 20_000, 30_000);
    expect(mid.x).toBeCloseTo((plotLeft + plotRight) / 2, 6);
    expect(mid.anchor).toBe("middle");
    expect(mid.showLoLabel).toBe(true);
    expect(mid.showHiLabel).toBe(true);
  });

  test("clamps prices outside the domain to the plot edges", () => {
    expect(quoteMarkerLayout(1, 20_000, 30_000).x).toBe(plotLeft);
    expect(quoteMarkerLayout(999_999, 20_000, 30_000).x).toBe(plotRight);
  });

  test("anchor flips near the edges so the label never runs off", () => {
    expect(quoteMarkerLayout(20_000, 20_000, 30_000).anchor).toBe("start");
    expect(quoteMarkerLayout(30_000, 20_000, 30_000).anchor).toBe("end");
  });

  test("domain edge labels yield when the quote label needs their corner", () => {
    const nearLeft = quoteMarkerLayout(20_100, 20_000, 30_000);
    expect(nearLeft.showLoLabel).toBe(false);
    expect(nearLeft.showHiLabel).toBe(true);

    const nearRight = quoteMarkerLayout(29_900, 20_000, 30_000);
    expect(nearRight.showLoLabel).toBe(true);
    expect(nearRight.showHiLabel).toBe(false);
  });

  test("a degenerate (zero-width) domain pins the marker to the left edge", () => {
    const layout = quoteMarkerLayout(25_000, 25_000, 25_000);
    expect(layout.x).toBe(plotLeft);
    expect(layout.anchor).toBe("start");
  });
});

describe("formatDollars", () => {
  test("rounds and adds thousands separators", () => {
    expect(formatDollars(24500.4)).toBe("$24,500");
    expect(formatDollars(999.5)).toBe("$1,000");
  });
});
