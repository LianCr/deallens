import type { Metadata } from "next";
import { ResearchClient } from "@/components/research/ResearchClient";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Listing analyzer",
  description:
    "Paste a vehicle listing or enter make, model, year, mileage, and price. DealLens collects citable comparables, scores the ask, and explains the verdict.",
};

/**
 * Primary research surface — Vehicle Listing Analyzer.
 * Existing /deal/... quote dashboard remains for shareable SSR demos.
 */
export default function ResearchPage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Used cars · first vertical</p>
        <h1 className={styles.title}>Is this listing a good deal?</h1>
        <p className={styles.lead}>
          Enter a listing URL or the vehicle details. DealLens gathers comparable offers from a
          controlled source, explains what counted (and what didn&apos;t), then scores the ask with
          the same percentile engine as the shareable deal dashboard.
        </p>
      </header>
      <ResearchClient />
    </main>
  );
}
