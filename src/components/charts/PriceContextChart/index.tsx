/**
 * PriceContextChart — where does the quote land in the market?
 *
 * Server component: the complete SVG (distribution, quartile band,
 * median and quote markers) is rendered on the server and visible with
 * JavaScript disabled. A client overlay with the sweep cursor mounts
 * lazily when the chart scrolls into view. See README.md next to this
 * file for the design notes.
 */
import type { PriceBucket } from "@/domain/types";
import { ChartSvg } from "./ChartSvg";
import { LazyMount } from "../LazyMount";
import Overlay from "./Overlay";
import styles from "./PriceContextChart.module.css";

export interface PriceContextChartProps {
  buckets: readonly PriceBucket[];
  quote: number;
  p25: number | null;
  median: number | null;
  p75: number | null;
}

export function PriceContextChart({
  buckets,
  quote,
  p25,
  median,
  p75,
}: PriceContextChartProps) {
  if (buckets.length === 0 || p25 === null || median === null || p75 === null) {
    return (
      <div className={styles.emptyState} role="status">
        Not enough market data to draw an honest distribution — and we
        won&apos;t guess.
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <ChartSvg buckets={buckets} quote={quote} p25={p25} median={median} p75={p75} />
      <LazyMount>
        <Overlay buckets={buckets} />
      </LazyMount>
    </div>
  );
}
