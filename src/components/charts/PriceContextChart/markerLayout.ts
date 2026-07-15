/**
 * Quote-marker layout math, kept zero-dependency on purpose: the server
 * uses it to render the SVG skeleton and the QuoteExplorer island uses
 * the very same function to move the marker live — without pulling any
 * D3 module into the first-load bundle. One function, two runtimes,
 * identical answers.
 */

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

/** Past this distance from an edge the label can stay centered. */
const ANCHOR_FLIP_PX = 70;
/** Domain edge labels yield when the quote label needs their corner. */
const EDGE_LABEL_CLEARANCE_PX = 150;

export interface QuoteMarkerLayout {
  /** Marker x in viewBox units, clamped to the plot area. */
  x: number;
  /** Label anchor flips near the edges so the text never runs off. */
  anchor: "start" | "middle" | "end";
  /** Whether the lo/hi domain labels have room to show. */
  showLoLabel: boolean;
  showHiLabel: boolean;
}

/**
 * Where the quote marker sits for a price, given the distribution's
 * domain. Linear interpolation — the same scale D3 would build, minus
 * the dependency.
 */
export function quoteMarkerLayout(
  price: number,
  domainLo: number,
  domainHi: number,
  geometry: ChartGeometry = DEFAULT_GEOMETRY,
): QuoteMarkerLayout {
  const { width, margin } = geometry;
  const plotLeft = margin.left;
  const plotRight = width - margin.right;
  const span = domainHi - domainLo;
  const raw =
    span > 0
      ? plotLeft + ((price - domainLo) / span) * (plotRight - plotLeft)
      : plotLeft;
  const x = Math.max(plotLeft, Math.min(plotRight, raw));
  return {
    x,
    anchor:
      x < plotLeft + ANCHOR_FLIP_PX
        ? "start"
        : x > plotRight - ANCHOR_FLIP_PX
          ? "end"
          : "middle",
    showLoLabel: x > plotLeft + EDGE_LABEL_CLEARANCE_PX,
    showHiLabel: x < plotRight - EDGE_LABEL_CLEARANCE_PX,
  };
}

/** Format a dollar amount for axis labels and readouts. */
export const formatDollars = (value: number): string =>
  `$${Math.round(value).toLocaleString("en-US")}`;
