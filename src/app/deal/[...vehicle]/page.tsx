import Link from "next/link";
import { notFound } from "next/navigation";
import { parseVehicleSegments, titleCase } from "@/lib/vehicleUrl";
import styles from "./page.module.css";

/**
 * Page 2 — Deal Dashboard. URL shape: /deal/{make}/{year}/{model}?quote=…
 * The URL is the whole state: shareable, server-renderable.
 *
 * M2 placeholder: parses and echoes the selection. The verdict hero,
 * distribution chart, and price history land in M3/M4.
 */
export const runtime = "nodejs";

interface DealPageProps {
  params: Promise<{ vehicle: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DealPage({ params, searchParams }: DealPageProps) {
  const { vehicle } = await params;
  const parsed = parseVehicleSegments(vehicle);
  if (!parsed) notFound();

  const quoteParam = (await searchParams).quote;
  const quote = Number(Array.isArray(quoteParam) ? quoteParam[0] : quoteParam);
  const hasQuote = Number.isInteger(quote) && quote > 0;

  const vehicleName = `${parsed.year} ${titleCase(parsed.make)} ${titleCase(parsed.model)}`;

  return (
    <main className={styles.main}>
      <p className={styles.breadcrumb}>
        <Link href="/">← Pick a different car</Link>
      </p>
      <h1 className={styles.title}>{vehicleName}</h1>
      {hasQuote ? (
        <p className={styles.quote}>
          Dealer quote: <strong>${quote.toLocaleString("en-US")}</strong>
        </p>
      ) : (
        <p className={styles.quote}>No quote entered yet.</p>
      )}
      <p className={styles.placeholder}>
        The price-context dashboard for this vehicle is under construction
        (next milestone): verdict, market distribution, and 24-month price
        history.
      </p>
    </main>
  );
}
