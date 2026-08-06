import styles from "./Shell.module.css";

/**
 * Global footer: the data-honesty statement, on every page. This is the
 * product's trust contract in one place — real sources named as real,
 * synthetic data named as synthetic, AI constrained to narration.
 */
export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <p className={styles.footerLine}>
          Vehicle catalog: NHTSA vPIC (real) · Fuel economy: fueleconomy.gov (real) ·
          Listing research: SerpAPI when configured, otherwise labeled demo fallback ·
          Deal-dashboard pricing: deterministic demo dataset where marked.
        </p>
        <p className={styles.footerLine}>
          AI narrates, math decides — recommendations only restate evidence the research
          pipeline collected.{" "}
          <a
            href="https://github.com/LianCr/deallens#readme"
            className={styles.footerLink}
            rel="noopener"
          >
            Methodology
          </a>
          {" · "}
          <a href="/research" className={styles.footerLink}>
            Listing analyzer
          </a>
          {" · "}
          <a href="/contact" className={styles.footerLink}>
            Contact (demo)
          </a>
        </p>
        <p className={styles.footerLine}>
          <a href="/dev/charts" className={styles.footerLink}>
            Chart gallery
          </a>
          {" · "}
          <a href="/api/graphql" className={styles.footerLink} rel="noopener">
            GraphQL playground
          </a>
          {" · "}
          Designed &amp; built by{" "}
          <a
            href="https://github.com/LianCr"
            className={styles.footerLink}
            rel="noopener"
          >
            Chunren Lian
          </a>{" "}
          · © 2026
        </p>
      </div>
    </footer>
  );
}
