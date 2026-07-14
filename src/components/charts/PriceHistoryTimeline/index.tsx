/**
 * PriceHistoryTimeline — how the price moved, and what happened around
 * it. Direct port of smart-money-decoder's GodModeTimeline (news ×
 * price odds) re-cut for car-market events × asking prices. See
 * README.md next to this file for the port table and design notes.
 *
 * Server component: renders the static skeleton (visible without JS)
 * and hands the same data to the lazy in-place upgrade.
 */
import type { MarketEvent, PricePoint } from "@/domain/types";
import { StaticTimeline } from "./StaticTimeline";
import { TimelineUpgrade } from "./TimelineUpgrade";
import styles from "./PriceHistoryTimeline.module.css";

export interface PriceHistoryTimelineProps {
  history: PricePoint[];
  events: MarketEvent[];
}

export function PriceHistoryTimeline({ history, events }: PriceHistoryTimelineProps) {
  if (history.length < 2) {
    return (
      <div className={styles.emptyState} role="status">
        Not enough price history to draw an honest chart.
      </div>
    );
  }

  return (
    <TimelineUpgrade history={history} events={events}>
      <StaticTimeline history={history} events={events} />
    </TimelineUpgrade>
  );
}
