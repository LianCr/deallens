import { buildHistogram } from "@/domain/histogram";
import { percentileValue } from "@/domain/percentile";
import { generatePricingDataset } from "@/sources/pricing-gen";
import { PriceContextChart } from "@/components/charts/PriceContextChart";
import { PriceHistoryTimeline } from "@/components/charts/PriceHistoryTimeline";
import { DemoDataBadge } from "@/components/DataBadge/DataBadge";
import styles from "./page.module.css";

/**
 * Storybook-lite: each chart component rendered in its interesting
 * states, from the same generators the app uses. Handy for visual
 * review and for pointing a reviewer at.
 */
export const metadata = { title: "Chart gallery — DealLens dev" };

export default function ChartGallery() {
  // A rich market and a deliberately thin one, both deterministic.
  const rich = generatePricingDataset("Honda", "Civic", 2022, "2026-07");
  const buckets = buildHistogram(rich.listings);
  const p25 = percentileValue(rich.listings, 25)!;
  const median = percentileValue(rich.listings, 50)!;
  const p75 = percentileValue(rich.listings, 75)!;

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Chart gallery</h1>
      <p className={styles.note}>
        Development showcase of the chart components in every state they
        ship with. All pricing shown is synthetic. <DemoDataBadge />
      </p>

      <section className={styles.item}>
        <h2 className={styles.itemTitle}>PriceContextChart — quote below market</h2>
        <PriceContextChart
          buckets={buckets}
          quote={Math.round(p25 * 0.97)}
          p25={p25}
          median={median}
          p75={p75}
        />
      </section>

      <section className={styles.item}>
        <h2 className={styles.itemTitle}>PriceContextChart — quote above market</h2>
        <PriceContextChart
          buckets={buckets}
          quote={Math.round(p75 * 1.06)}
          p25={p25}
          median={median}
          p75={p75}
        />
      </section>

      <section className={styles.item}>
        <h2 className={styles.itemTitle}>PriceContextChart — honest empty state</h2>
        <PriceContextChart buckets={[]} quote={20000} p25={null} median={null} p75={null} />
      </section>

      <section className={styles.item}>
        <h2 className={styles.itemTitle}>
          PriceHistoryTimeline — sweep, snap to events, click to pin
        </h2>
        <PriceHistoryTimeline history={rich.history} events={rich.events} />
      </section>

      <section className={styles.item}>
        <h2 className={styles.itemTitle}>PriceHistoryTimeline — honest empty state</h2>
        <PriceHistoryTimeline history={[]} events={[]} />
      </section>
    </main>
  );
}
