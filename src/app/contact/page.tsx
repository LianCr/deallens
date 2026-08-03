import Link from "next/link";
import { ContactForm } from "./ContactForm";
import styles from "./page.module.css";

/**
 * Page 3 — Contact Dealer. A lead form built for performance and
 * conversion: progressive enhancement, field-level validation, zero
 * layout shift. Vehicle context arrives in the URL and is shown as a
 * structured context strip above the form.
 */
export const metadata = {
  title: "Contact dealer — DealLens",
  description: "Reach out to the dealer about this vehicle.",
};

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.vehicle) ? params.vehicle[0] : params.vehicle;
  const vehicleName = raw?.trim() || null;

  const offerRaw = Array.isArray(params.offer) ? params.offer[0] : params.offer;
  const offerNumber = Number(offerRaw);
  const offer =
    offerRaw !== undefined &&
    Number.isInteger(offerNumber) &&
    offerNumber > 0 &&
    offerNumber <= 5_000_000
      ? offerNumber
      : null;

  return (
    <main className={styles.main}>
      <p className={styles.breadcrumb}>
        <Link href="/">← DealLens</Link>
      </p>
      <h1 className={styles.title}>Contact the dealer</h1>
      <p className={styles.subtitle}>
        {vehicleName
          ? `About the ${vehicleName}.`
          : "Ask about availability, schedule a test drive, or negotiate from the numbers."}{" "}
        They reply to your email — no account needed.
      </p>

      {(vehicleName || offer != null) && (
        <aside className={styles.contextStrip} aria-label="Deal context">
          {vehicleName && (
            <div className={styles.contextItem}>
              <span className={styles.contextLabel}>Vehicle</span>
              <span className={styles.contextValue}>{vehicleName}</span>
            </div>
          )}
          {offer != null && (
            <div className={styles.contextItem}>
              <span className={styles.contextLabel}>Your offer</span>
              <span className={`${styles.contextValue} price-figure`}>
                ${offer.toLocaleString("en-US")}
              </span>
            </div>
          )}
        </aside>
      )}

      <ContactForm vehicleName={vehicleName} offer={offer} />
    </main>
  );
}
