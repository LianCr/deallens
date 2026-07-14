"use client";

/**
 * Defers mounting (and therefore downloading) interactive chart layers
 * until the chart scrolls into view. The server-rendered SVG underneath
 * is already complete, so nothing shifts — the page just quietly gains
 * interactivity. Keeps D3-flavored JS out of the critical path.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

export function LazyMount({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!("IntersectionObserver" in window)) {
      // Ancient browser: mount on the next tick instead of never.
      const timer = setTimeout(() => setVisible(true), 0);
      return () => clearTimeout(timer);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ position: "absolute", inset: 0 }}>
      {visible ? children : null}
    </div>
  );
}
