import type { EventCluster, MarketEvent } from "./types";

/**
 * Group timeline events by month so multiple events in the same month
 * render as a single dot with a count badge (the cluster-dot pattern
 * from smart-money-decoder's news timeline).
 *
 * Output is sorted by month ascending; events inside a cluster keep
 * their input order.
 */
export function clusterEventsByMonth(
  events: readonly MarketEvent[],
): EventCluster[] {
  const byMonth = new Map<string, MarketEvent[]>();
  for (const event of events) {
    const bucket = byMonth.get(event.month);
    if (bucket) bucket.push(event);
    else byMonth.set(event.month, [event]);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, monthEvents]) => ({
      month,
      count: monthEvents.length,
      events: monthEvents,
    }));
}
