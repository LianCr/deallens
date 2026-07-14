import styles from "./DataBadge.module.css";

/**
 * Data honesty, visible. Real API data is unlabeled; anything synthetic
 * must carry the DEMO badge wherever it appears (red line #4 of the
 * project: honesty over polish).
 */
export function DemoDataBadge() {
  return (
    <span className={styles.demoBadge} title="Synthetic dataset — methodology in the README">
      Demo pricing data
    </span>
  );
}

/** The page-level provenance summary, pinned near the title. */
export function ProvenanceBadge() {
  return (
    <p className={styles.provenance}>
      Vehicle data: NHTSA (real) · Pricing: demo dataset
    </p>
  );
}
