/**
 * The chart's SVG — a pure function of its props, with no hooks and no
 * event handlers, so a server component can render it as-is (the
 * isomorphic skeleton) and the client overlay adds interactivity on
 * top without redrawing it.
 */
import type { PriceBucket } from "@/domain/types";
import { buildDistributionShape } from "./math";
import {
  DEFAULT_GEOMETRY,
  formatDollars,
  quoteMarkerLayout,
  type ChartGeometry,
} from "./markerLayout";
import styles from "./PriceContextChart.module.css";

export interface ChartSvgProps {
  buckets: readonly PriceBucket[];
  quote: number;
  p25: number;
  median: number;
  p75: number;
  geometry?: ChartGeometry;
}

export function ChartSvg({
  buckets,
  quote,
  p25,
  median,
  p75,
  geometry = DEFAULT_GEOMETRY,
}: ChartSvgProps) {
  const shape = buildDistributionShape(buckets, geometry);
  if (!shape) return null;
  const { width, height, margin } = geometry;
  const { x } = shape;
  const plotTop = margin.top;
  const plotBottom = height - margin.bottom;
  const [domainLo, domainHi] = x.domain() as [number, number];
  // The same zero-dep function the QuoteExplorer island runs client-side
  // to move this marker live — server and client can't disagree.
  const marker = quoteMarkerLayout(quote, domainLo, domainHi, geometry);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Market price distribution. Your quote of ${formatDollars(quote)} versus a median of ${formatDollars(median)}.`}
      className={styles.svg}
    >
      {/* Quartile band: the middle 50% of the market. */}
      <rect
        x={x(p25)}
        y={plotTop}
        width={Math.max(0, x(p75) - x(p25))}
        height={plotBottom - plotTop}
        className={styles.quartileBand}
      />

      <path d={shape.areaPath} className={styles.area} />
      <path d={shape.linePath} className={styles.line} />

      {/* Median marker. */}
      <line
        x1={x(median)}
        x2={x(median)}
        y1={plotTop}
        y2={plotBottom}
        className={styles.medianLine}
      />
      <text x={x(median)} y={plotTop - 6} textAnchor="middle" className={styles.medianLabel}>
        median {formatDollars(median)}
      </text>

      {/* The shopper's quote — the loudest mark on the chart. Anchor
          flips near the edges so the label never runs off or collides
          with the domain labels (which yield to it). The group carries a
          data hook so the QuoteExplorer island can slide it (transform
          only) as the shopper explores other quotes. */}
      <g data-quote-marker>
        <line
          x1={marker.x}
          x2={marker.x}
          y1={plotTop}
          y2={plotBottom}
          className={styles.quoteLine}
        />
        <circle cx={marker.x} cy={plotTop} r={5} className={styles.quoteDot} />
        <text
          data-quote-label
          x={marker.x}
          y={plotBottom + 20}
          textAnchor={marker.anchor}
          className={styles.quoteLabel}
        >
          your quote {formatDollars(quote)}
        </text>
      </g>

      {/* Domain edge labels — hidden (not removed, so the island can
          toggle them) when the quote label needs the space. */}
      <text
        data-axis-lo
        x={margin.left}
        y={plotBottom + 20}
        textAnchor="start"
        visibility={marker.showLoLabel ? undefined : "hidden"}
        className={styles.axisLabel}
      >
        {formatDollars(domainLo)}
      </text>
      <text
        data-axis-hi
        x={width - margin.right}
        y={plotBottom + 20}
        textAnchor="end"
        visibility={marker.showHiLabel ? undefined : "hidden"}
        className={styles.axisLabel}
      >
        {formatDollars(domainHi)}
      </text>
    </svg>
  );
}
