import Link from "next/link";
import styles from "./Shell.module.css";

/**
 * Global app shell header — server component, zero client JS. The
 * wordmark is a link, not a heading, so each page keeps its own h1.
 */
export function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.wordmark}>
          Deal<span className={styles.wordmarkAccent}>Lens</span>
        </Link>
        <nav className={styles.nav} aria-label="Primary">
          <Link href="/" className={styles.navLink}>
            Pick a car
          </Link>
          <Link href="/dev/charts" className={styles.navLink}>
            Chart gallery
          </Link>
          <a
            href="https://github.com/LianCr/deallens"
            className={styles.navLink}
            rel="noopener"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
