/**
 * The server-rendered skeleton: identical layout to the interactive
 * timeline (header, chart, fixed-height readout) with no interactivity.
 * Rendered by a server component, visible with JavaScript disabled, and
 * replaced in place on hydration — zero layout shift.
 */
import type { MarketEvent, PricePoint } from "@/domain/types";
import { TimelineSvg } from "./TimelineSvg";
import { buildTimelineShape, formatMonth, monthToDate } from "./math";
import styles from "./PriceHistoryTimeline.module.css";

interface StaticTimelineProps {
  history: PricePoint[];
  events: MarketEvent[];
}

export function StaticTimeline({ history, events }: StaticTimelineProps) {
  const shape = buildTimelineShape(history, events, "24");
  if (!shape) return null;

  const first = shape.points[0]!;
  const last = shape.points.at(-1)!;
  const delta = last.price - first.price;

  return (
    <div className={styles.container} data-testid="price-history-timeline">
      <div className={styles.header}>
        <span className={`${styles.headerPrice} ${shape.rising ? styles.risingText : styles.fallingText}`}>
          ${Math.round(last.price).toLocaleString("en-US")}
        </span>
        <span className={styles.headerUnit}>median asking price, latest month</span>
        <span
          className={`${styles.headerDelta} ${shape.rising ? styles.risingText : styles.fallingText}`}
        >
          {delta >= 0 ? "▲ +" : "▼ −"}${Math.abs(Math.round(delta)).toLocaleString("en-US")}
          <span className={styles.headerDeltaLabel}> over this window</span>
        </span>
        <span className={styles.rangeSwitch} aria-hidden>
          <span className={styles.rangeOn}>24M</span>
        </span>
      </div>

      <div className={styles.plotWrap}>
        <TimelineSvg
          shape={shape}
          cursorIndex={null}
          activeClusterMonth={null}
          pinnedMonth={null}
        />
      </div>

      <div className={styles.readout}>
        <div className={styles.readoutHint}>
          {shape.clusters.length > 0
            ? `${shape.clusters.length} market-event markers from ${formatMonth(monthToDate(first.month))} to ${formatMonth(monthToDate(last.month))} — interactive sweep loads with JavaScript`
            : "No market events in this window"}
        </div>
      </div>
    </div>
  );
}
