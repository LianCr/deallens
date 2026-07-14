"use client";

/**
 * In-place isomorphic upgrade: shows the server-rendered skeleton
 * (passed as children) until the timeline scrolls into view, then swaps
 * in the interactive component. Both render the same layout from the
 * same math, so the swap is invisible — no flash, no layout shift —
 * and the D3-flavored interactive chunk stays off the critical path.
 */
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import type { MarketEvent, PricePoint } from "@/domain/types";

const InteractiveTimeline = lazy(() => import("./InteractiveTimeline"));

interface TimelineUpgradeProps {
  history: PricePoint[];
  events: MarketEvent[];
  children: ReactNode; // the server-rendered StaticTimeline
}

export function TimelineUpgrade({ history, events, children }: TimelineUpgradeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [upgraded, setUpgraded] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!("IntersectionObserver" in window)) {
      const timer = setTimeout(() => setUpgraded(true), 0);
      return () => clearTimeout(timer);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setUpgraded(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref}>
      {upgraded ? (
        <Suspense fallback={children}>
          <InteractiveTimeline history={history} events={events} />
        </Suspense>
      ) : (
        children
      )}
    </div>
  );
}
