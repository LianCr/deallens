"use client";

/**
 * Interactive layer over the static SVG: a sweep cursor with a live
 * price + percentile readout. Pointer moves mutate the DOM directly
 * through refs (transform + textContent only — no React re-render per
 * move, no layout properties touched), which is what keeps the sweep
 * at 60fps.
 */
import { useRef } from "react";
import type { PriceBucket } from "@/domain/types";
import {
  buildDistributionShape,
  DEFAULT_GEOMETRY,
  formatDollars,
  percentileFromBuckets,
  type ChartGeometry,
} from "./math";
import styles from "./PriceContextChart.module.css";

interface OverlayProps {
  buckets: readonly PriceBucket[];
  geometry?: ChartGeometry;
}

export default function Overlay({
  buckets,
  geometry = DEFAULT_GEOMETRY,
}: OverlayProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);

  const shape = buildDistributionShape(buckets, geometry);
  if (!shape) return null;
  const { width, margin } = geometry;

  const handleMove = (clientX: number) => {
    const surface = surfaceRef.current;
    const cursor = cursorRef.current;
    const readout = readoutRef.current;
    if (!surface || !cursor || !readout) return;

    const rect = surface.getBoundingClientRect();
    // The SVG scales with its container; work in viewBox units.
    const viewX = ((clientX - rect.left) / rect.width) * width;
    const clamped = Math.max(margin.left, Math.min(width - margin.right, viewX));
    const price = shape.x.invert(clamped);
    const percentile = percentileFromBuckets(buckets, price);

    cursor.style.transform = `translateX(${(clamped / width) * rect.width}px)`;
    cursor.style.opacity = "1";
    readout.textContent =
      percentile === null
        ? formatDollars(price)
        : `${formatDollars(price)} · cheaper than ${Math.round(percentile)}% of listings`;
    readout.style.opacity = "1";
  };

  const handleLeave = () => {
    if (cursorRef.current) cursorRef.current.style.opacity = "0";
    if (readoutRef.current) readoutRef.current.style.opacity = "0";
  };

  return (
    <div
      ref={surfaceRef}
      className={styles.overlay}
      data-testid="chart-overlay"
      onPointerMove={(e) => handleMove(e.clientX)}
      onPointerDown={(e) => handleMove(e.clientX)}
      onPointerLeave={handleLeave}
    >
      <div ref={cursorRef} className={styles.cursor} aria-hidden />
      <div ref={readoutRef} className={styles.readout} aria-live="polite" />
    </div>
  );
}
