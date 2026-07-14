/**
 * The chart's SVG — a pure function of its props, with no hooks and no
 * event handlers, so a server component can render it as-is (the
 * isomorphic skeleton) and the client overlay adds interactivity on
 * top without redrawing it.
 */
import type { PriceBucket } from "@/domain/types";
import {
  buildDistributionShape,
  DEFAULT_GEOMETRY,
  formatDollars,
  type ChartGeometry,
} from "./math";
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
  const clampedQuoteX = Math.max(
    margin.left,
    Math.min(width - margin.right, x(quote)),
  );

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
          with the domain labels (which yield to it). */}
      <line
        x1={clampedQuoteX}
        x2={clampedQuoteX}
        y1={plotTop}
        y2={plotBottom}
        className={styles.quoteLine}
      />
      <circle cx={clampedQuoteX} cy={plotTop} r={5} className={styles.quoteDot} />
      <text
        x={clampedQuoteX}
        y={plotBottom + 20}
        textAnchor={
          clampedQuoteX < margin.left + 70
            ? "start"
            : clampedQuoteX > width - margin.right - 70
              ? "end"
              : "middle"
        }
        className={styles.quoteLabel}
      >
        your quote {formatDollars(quote)}
      </text>

      {/* Domain edge labels — hidden when the quote label needs the space. */}
      {clampedQuoteX > margin.left + 150 && (
        <text x={margin.left} y={plotBottom + 20} textAnchor="start" className={styles.axisLabel}>
          {formatDollars(shape.x.domain()[0]!)}
        </text>
      )}
      {clampedQuoteX < width - margin.right - 150 && (
        <text
          x={width - margin.right}
          y={plotBottom + 20}
          textAnchor="end"
          className={styles.axisLabel}
        >
          {formatDollars(shape.x.domain()[1]!)}
        </text>
      )}
    </svg>
  );
}
