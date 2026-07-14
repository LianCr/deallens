/**
 * The timeline's SVG — a pure function of props, no hooks, no handlers.
 * The server renders it as the isomorphic skeleton (cursor = null); the
 * interactive client re-renders the same component with a live cursor
 * index and active cluster. One rendering path, two lives.
 */
import type { TimelineShape, TimelineGeometry, PositionedCluster } from "./math";
import { TIMELINE_GEOMETRY, formatMonth, formatShortDollars, monthToDate } from "./math";
import styles from "./PriceHistoryTimeline.module.css";

export interface TimelineSvgProps {
  shape: TimelineShape;
  /** Snapped series index under the pointer, or null (static render). */
  cursorIndex: number | null;
  activeClusterMonth: string | null;
  pinnedMonth: string | null;
  geometry?: TimelineGeometry;
}

const KIND_CLASS: Record<PositionedCluster["events"][number]["kind"], string> = {
  MODEL_YEAR: "nodeModelYear",
  SEASONAL: "nodeSeasonal",
  INCENTIVE: "nodeIncentive",
};

/** A cluster's dot takes the kind of its highest-priority event. */
function clusterKindClass(cluster: PositionedCluster): string {
  const kinds = cluster.events.map((e) => e.kind);
  const kind =
    kinds.find((k) => k === "MODEL_YEAR") ??
    kinds.find((k) => k === "INCENTIVE") ??
    "SEASONAL";
  return KIND_CLASS[kind];
}

export function TimelineSvg({
  shape,
  cursorIndex,
  activeClusterMonth,
  pinnedMonth,
  geometry = TIMELINE_GEOMETRY,
}: TimelineSvgProps) {
  const { width, height, margin } = geometry;
  const { points, x, y, plotWidth, plotHeight, rising } = shape;
  const directionClass = rising ? styles.rising : styles.falling;
  const cursor = cursorIndex !== null ? points[cursorIndex] : undefined;
  const first = points[0]!;
  const last = points.at(-1)!;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={styles.svg}
      role="img"
      aria-label={`Price history from ${formatMonth(monthToDate(first.month))} (${formatShortDollars(first.price)}) to ${formatMonth(monthToDate(last.month))} (${formatShortDollars(last.price)}), with ${shape.clusters.length} market event markers.`}
    >
      <defs>
        <linearGradient id="pht-grad-rising" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-good)" stopOpacity="0.24" />
          <stop offset="100%" stopColor="var(--color-good)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="pht-grad-falling" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-bad)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--color-bad)" stopOpacity="0" />
        </linearGradient>
      </defs>

      <g transform={`translate(${margin.left},${margin.top})`}>
        {/* Grid + ticks */}
        {shape.xTicks.map((tick, i) => (
          <g key={`x${i}`}>
            <line
              x1={x(tick)}
              x2={x(tick)}
              y1={0}
              y2={plotHeight}
              className={styles.gridV}
            />
            <text x={x(tick)} y={plotHeight + 16} className={styles.xTick}>
              {formatMonth(tick)}
            </text>
          </g>
        ))}
        {shape.yTicks.map((tick, i) => (
          <g key={`y${i}`}>
            <line x1={0} x2={plotWidth} y1={y(tick)} y2={y(tick)} className={styles.gridH} />
            <text x={plotWidth + 6} y={y(tick)} dy="0.32em" className={styles.yTick}>
              {formatShortDollars(tick)}
            </text>
          </g>
        ))}

        {/* Price area + line (monotone curve, direction-tinted) */}
        <path
          d={shape.areaPath}
          fill={`url(#pht-grad-${rising ? "rising" : "falling"})`}
        />
        <path d={shape.linePath} className={`${styles.line} ${directionClass}`} />

        {/* Event cluster dots, pinned to the price at their month */}
        {shape.clusters.map((cluster) => {
          const active = cluster.month === activeClusterMonth;
          const pinned = cluster.month === pinnedMonth;
          return (
            <g key={cluster.month}>
              <circle
                cx={cluster.x}
                cy={cluster.y}
                r={active ? 7.5 : 5.5}
                className={`${styles.node} ${styles[clusterKindClass(cluster) as keyof typeof styles]} ${active ? styles.nodeActive : ""}`}
                data-month={cluster.month}
              />
              {cluster.count > 1 && (
                <>
                  <circle cx={cluster.x + 8} cy={cluster.y - 9} r={6.5} className={styles.badgeBg} />
                  <text x={cluster.x + 8} y={cluster.y - 9} dy="0.34em" className={styles.badgeText}>
                    {cluster.count}
                  </text>
                </>
              )}
              {pinned && (
                <circle cx={cluster.x} cy={cluster.y} r={11.5} className={styles.pinRing} />
              )}
            </g>
          );
        })}

        {/* Sweep cursor: vertical + horizontal hairlines and a dot,
            snapped to the month under the pointer. */}
        {cursor && (
          <g>
            <line
              x1={x(monthToDate(cursor.month))}
              x2={x(monthToDate(cursor.month))}
              y1={0}
              y2={plotHeight}
              className={styles.crossV}
            />
            <line
              x1={0}
              x2={plotWidth}
              y1={y(cursor.price)}
              y2={y(cursor.price)}
              className={styles.crossH}
            />
            <circle
              cx={x(monthToDate(cursor.month))}
              cy={y(cursor.price)}
              r={5}
              className={`${styles.crossDot} ${directionClass}`}
            />
          </g>
        )}
        {!cursor && (
          <circle
            cx={x(monthToDate(last.month))}
            cy={y(last.price)}
            r={4.5}
            className={`${styles.nowDot} ${directionClass}`}
          />
        )}
      </g>
    </svg>
  );
}
