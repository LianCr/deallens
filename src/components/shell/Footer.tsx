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
          Pricing: deterministic demo dataset, labeled wherever it appears.
        </p>
        <p className={styles.footerLine}>
          AI narrates, math decides — the model can only restate numbers the pricing
          engine computed.{" "}
          <a
            href="https://github.com/LianCr/deallens#readme"
            className={styles.footerLink}
            rel="noopener"
          >
            Methodology
          </a>
        </p>
        <p className={styles.footerLine}>
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
