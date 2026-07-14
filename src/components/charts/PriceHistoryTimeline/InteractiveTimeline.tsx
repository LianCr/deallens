"use client";

/**
 * The hydrated timeline: sweep cursor with rolling-number readout,
 * event clusters that activate on approach and pin on click, and the
 * 6M/12M/24M range switch.
 *
 * Interaction state is the SNAPPED SERIES INDEX, not the raw pointer
 * position — monthly data has at most 24 distinct cursor states, so a
 * full sweep costs a bounded handful of renders (and identical-index
 * moves bail out in setState). The readout bar below the chart has a
 * fixed height so activating a cluster never shifts layout.
 */
import { useMemo, useState } from "react";
import type { MarketEvent, PricePoint } from "@/domain/types";
import { RollingNumber } from "../RollingNumber";
import { TimelineSvg } from "./TimelineSvg";
import {
  buildTimelineShape,
  nearestIndex,
  snappedCluster,
  RANGES,
  TIMELINE_GEOMETRY,
  formatMonth,
  monthToDate,
  type RangeKey,
} from "./math";
import styles from "./PriceHistoryTimeline.module.css";

interface InteractiveTimelineProps {
  history: PricePoint[];
  events: MarketEvent[];
}

const EVENT_KIND_LABEL: Record<MarketEvent["kind"], string> = {
  MODEL_YEAR: "Model year",
  SEASONAL: "Seasonal",
  INCENTIVE: "Incentive",
};

export default function InteractiveTimeline({
  history,
  events,
}: InteractiveTimelineProps) {
  const [range, setRange] = useState<RangeKey>("24");
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [pinnedMonth, setPinnedMonth] = useState<string | null>(null);

  const shape = useMemo(
    () => buildTimelineShape(history, events, range),
    [history, events, range],
  );
  if (!shape) return null; // parent already guards; belt and suspenders

  const { width, margin } = TIMELINE_GEOMETRY;
  const hoverCluster =
    cursorIndex !== null ? snappedCluster(shape, cursorIndex) : null;
  const activeCluster = pinnedMonth
    ? (shape.clusters.find((c) => c.month === pinnedMonth) ?? null)
    : hoverCluster;

  const cursorPoint = cursorIndex !== null ? shape.points[cursorIndex] : undefined;
  const first = shape.points[0]!;
  const last = shape.points.at(-1)!;
  const shownPrice = cursorPoint?.price ?? last.price;
  const delta = last.price - first.price;

  const handleMove = (clientX: number, currentTarget: Element) => {
    const rect = currentTarget.getBoundingClientRect();
    const plotX = Math.max(
      0,
      Math.min(
        shape.plotWidth,
        ((clientX - rect.left) / rect.width) * width - margin.left,
      ),
    );
    setCursorIndex(nearestIndex(shape, plotX));
  };

  const handleClick = () => {
    if (hoverCluster) {
      setPinnedMonth(pinnedMonth === hoverCluster.month ? null : hoverCluster.month);
    } else if (pinnedMonth) {
      setPinnedMonth(null);
    }
  };

  return (
    <div className={styles.container} data-testid="price-history-timeline">
      <div className={styles.header}>
        <span className={`${styles.headerPrice} ${shape.rising ? styles.risingText : styles.fallingText}`}>
          <RollingNumber value={`$${Math.round(shownPrice).toLocaleString("en-US")}`} />
        </span>
        <span className={styles.headerUnit}>
          {cursorPoint
            ? `median asking price, ${formatMonth(monthToDate(cursorPoint.month))}`
            : "median asking price, latest month"}
        </span>
        {!cursorPoint && (
          <span
            className={`${styles.headerDelta} ${shape.rising ? styles.risingText : styles.fallingText}`}
          >
            {delta >= 0 ? "▲ +" : "▼ −"}${Math.abs(Math.round(delta)).toLocaleString("en-US")}
            <span className={styles.headerDeltaLabel}> over this window</span>
          </span>
        )}
        <span className={styles.rangeSwitch} role="group" aria-label="Time range">
          {RANGES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={range === key ? styles.rangeOn : styles.rangeOff}
              aria-pressed={range === key}
              onClick={() => {
                setRange(key);
                setCursorIndex(null);
                setPinnedMonth(null);
              }}
            >
              {label}
            </button>
          ))}
        </span>
      </div>

      <div
        className={styles.plotWrap}
        onPointerMove={(e) => handleMove(e.clientX, e.currentTarget)}
        onPointerDown={(e) => handleMove(e.clientX, e.currentTarget)}
        onPointerLeave={() => setCursorIndex(null)}
        onClick={handleClick}
      >
        <TimelineSvg
          shape={shape}
          cursorIndex={cursorIndex}
          activeClusterMonth={activeCluster?.month ?? null}
          pinnedMonth={pinnedMonth}
        />
      </div>

      {/* Fixed-height readout: event details never cover the price line
          and never shift layout. Click pins, so the story survives the
          pointer leaving. */}
      <div
        className={`${styles.readout} ${activeCluster ? styles.readoutOn : ""}`}
        data-testid="timeline-readout"
      >
        {activeCluster ? (
          <>
            <div className={styles.readoutHead}>
              <span className={styles.readoutDate}>
                {formatMonth(monthToDate(activeCluster.month))}
              </span>
              {pinnedMonth === activeCluster.month && (
                <span className={styles.readoutPin} title="Pinned — click the dot again to release">
                  📌
                </span>
              )}
            </div>
            {activeCluster.events.slice(0, 3).map((event, i) => (
              <div key={i} className={styles.readoutLine}>
                <span className={`${styles.kindTag} ${styles[`kind${event.kind}` as keyof typeof styles]}`}>
                  {EVENT_KIND_LABEL[event.kind]}
                </span>
                <span className={styles.readoutTitle}>{event.title}</span>
              </div>
            ))}
            {activeCluster.events.length > 3 && (
              <div className={styles.readoutMore}>
                +{activeCluster.events.length - 3} more this month
              </div>
            )}
            <div className={styles.readoutFoot}>
              Correlated in time with price moves — <b>not causal</b>. Demo dataset.
            </div>
          </>
        ) : (
          <div className={styles.readoutHint}>
            Sweep the chart · pass near a dot to see the market event · click to pin
          </div>
        )}
      </div>
    </div>
  );
}
