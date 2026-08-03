import styles from "./DataBadge.module.css";

/**
 * Data honesty, visible. Real API data is unlabeled; anything synthetic
 * must carry the DEMO badge wherever it appears (red line #4 of the
 * project: honesty over polish). Links to the methodology anchor so
 * reviewers can read how the synthetic set is built.
 */
export function DemoDataBadge() {
  return (
    <a
      href="https://github.com/LianCr/deallens#methodology"
      className={styles.demoBadge}
      target="_blank"
      rel="noopener noreferrer"
      title="Synthetic dataset — methodology in the README"
    >
      Demo pricing data
    </a>
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
