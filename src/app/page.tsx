import styles from "./page.module.css";

/**
 * Page 1 — vehicle picker (placeholder until M2).
 * Server component: the LCP element is static text, rendered on the server.
 */
export default function Home() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>DealLens</h1>
      <p className={styles.tagline}>
        Is this price fair? See where a dealer quote lands in the market —
        not just a number, but the context around it.
      </p>
    </main>
  );
}
