/**
 * WhenToBuy — a caption-grade hint under the price-history timeline:
 * which calendar month this market has been cheapest in, and by how
 * much. Server component; all the math lives in domain/whenToBuy.ts.
 *
 * Renders nothing when the domain function returns null — for a thin
 * or flat market, absence is the honest state (the timeline's own
 * empty state already covers thin history). Provenance is covered by
 * the section header's DemoDataBadge, so no second badge here.
 */
import type { PricePoint } from "@/domain/types";
import { whenToBuy } from "@/domain/whenToBuy";
import styles from "./WhenToBuy.module.css";

export function WhenToBuy({ history }: { history: PricePoint[] }) {
  const hint = whenToBuy(history);
  if (!hint) return null;

  return (
    <p className={styles.hint} data-testid="when-to-buy">
      <svg
        className={styles.icon}
        viewBox="0 0 24 24"
        width="14"
        height="14"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
      <span>
        In this market, prices have dipped lowest in{" "}
        <strong className={styles.emphasis}>{hint.monthName}</strong> — about{" "}
        <strong className={styles.emphasis}>
          {hint.belowAveragePct.toFixed(1)}% below
        </strong>{" "}
        the year&apos;s average.
      </span>
    </p>
  );
}
