import Link from "next/link";
import { notFound } from "next/navigation";
import { executeGraphQL } from "@/graphql/yoga";
import { dealPath, parseVehicleSegments, titleCase } from "@/lib/vehicleUrl";
import type { PriceBucket, MarketEvent, PricePoint, Verdict } from "@/domain/types";
import {
  annualFuelCost,
  DEFAULT_DOLLARS_PER_GALLON,
  DEFAULT_MILES_PER_YEAR,
} from "@/domain/fuelCost";
import { PriceContextChart } from "@/components/charts/PriceContextChart";
import { PriceHistoryTimeline } from "@/components/charts/PriceHistoryTimeline";
import { DemoDataBadge, ProvenanceBadge } from "@/components/DataBadge/DataBadge";
import { AiBadge, DealBrief } from "@/components/DealBrief/DealBrief";
import { QuoteExplorer } from "@/components/QuoteExplorer/QuoteExplorer";
import styles from "./page.module.css";

/**
 * Page 2 — Deal Dashboard. URL shape: /deal/{make}/{year}/{model}?quote=…
 * The URL is the whole state: shareable, and the verdict is computed
 * server-side so the conclusion is readable with JavaScript disabled.
 */
export const runtime = "nodejs";

interface PriceContext {
  quote: number;
  verdict: Verdict;
  percentile: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  distribution: PriceBucket[];
  history: PricePoint[];
  events: MarketEvent[];
  samples: number[];
  dataSource: "REAL" | "DEMO";
}

interface FuelEconomyData {
  combinedMpg: number;
  feModelName: string;
  fuelType: string;
}

/** Year range the pricing gateway accepts; outside it the URL is junk. */
const YEAR_MIN = 1980;
const YEAR_MAX = 2035;
/** GraphQL Int is 32-bit; also no car costs a billion dollars. */
const QUOTE_MAX = 5_000_000;

interface DealPageProps {
  params: Promise<{ vehicle: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Pick<DealPageProps, "params">) {
  const parsed = parseVehicleSegments((await params).vehicle);
  if (!parsed) return { title: "Deal not found" };
  return {
    title: `${parsed.year} ${titleCase(parsed.make)} ${titleCase(parsed.model)} — is the price fair?`,
  };
}

export default async function DealPage({ params, searchParams }: DealPageProps) {
  const { vehicle } = await params;
  const parsed = parseVehicleSegments(vehicle);
  // Malformed or out-of-range URLs are a 404, never a 500 — shared
  // links get fuzzed, and this page's whole point is being shareable.
  if (!parsed || parsed.year < YEAR_MIN || parsed.year > YEAR_MAX) notFound();

  const query = await searchParams;
  const quoteParam = Array.isArray(query.quote) ? query.quote[0] : query.quote;
  const quote = Number(quoteParam);
  // An absurd or malformed quote falls back to the quote prompt.
  const hasQuote = Number.isInteger(quote) && quote > 0 && quote <= QUOTE_MAX;

  const vehicleName = `${parsed.year} ${titleCase(parsed.make)} ${titleCase(parsed.model)}`;
  const selfPath = dealPath(parsed.make, parsed.year, parsed.model);

  if (!hasQuote) {
    return (
      <main className={styles.main}>
        <Header vehicleName={vehicleName} />
        <section className={styles.quotePrompt}>
          <h2 className={styles.sectionTitle}>What did the dealer quote you?</h2>
          <form action={selfPath} method="get" className={styles.quoteForm}>
            <label className={styles.quoteLabel} htmlFor="deal-quote">
              Dealer quote (USD)
            </label>
            <input
              id="deal-quote"
              name="quote"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              required
              placeholder="e.g. 24500"
              className={styles.quoteInput}
            />
            <button type="submit" className={styles.quoteSubmit}>
              See where it lands
            </button>
          </form>
        </section>
      </main>
    );
  }

  const [{ priceContext }, fuelEconomy] = await Promise.all([
    executeGraphQL<{ priceContext: PriceContext }>(
      `query Deal($make: String!, $model: String!, $year: Int!, $quote: Int!) {
        priceContext(make: $make, model: $model, year: $year, quote: $quote) {
          quote verdict percentile p25 median p75
          distribution { lo hi count }
          history { month price }
          events { month title kind }
          samples
          dataSource
        }
      }`,
      { make: parsed.make, model: parsed.model, year: parsed.year, quote },
    ),
    // Fuel economy is independent and allowed to fail without taking
    // the verdict down with it: null = hide the bar, honestly.
    executeGraphQL<{ fuelEconomy: FuelEconomyData | null }>(
      `query Fuel($make: String!, $model: String!, $year: Int!) {
        fuelEconomy(make: $make, model: $model, year: $year) {
          combinedMpg feModelName fuelType
        }
      }`,
      { make: parsed.make, model: parsed.model, year: parsed.year },
    ).then(
      (data) => data.fuelEconomy,
      () => null,
    ),
  ]);

  const fuelCost = fuelEconomy
    ? annualFuelCost({ combinedMpg: fuelEconomy.combinedMpg })
    : null;

  const firstBucket = priceContext.distribution[0];
  const lastBucket = priceContext.distribution.at(-1);
  const chartDomain =
    firstBucket && lastBucket ? { lo: firstBucket.lo, hi: lastBucket.hi } : null;

  return (
    <main className={styles.main}>
      <Header vehicleName={vehicleName} />

      {/* Hero verdict + quote slider. The island server-renders the same
          hero HTML as ever (readable without JS; the slider degrades to
          a GET form), then hydrates the verdict math client-side using
          the identical domain functions the server ran. The chart
          section rides along as children so its quote marker can follow
          the slider without redrawing the SVG. */}
      <QuoteExplorer
        samples={priceContext.samples}
        initialQuote={priceContext.quote}
        median={priceContext.median}
        domain={chartDomain}
        vehiclePath={selfPath}
        contactHref={`/contact?vehicle=${encodeURIComponent(vehicleName)}`}
      >
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Where this quote lands in the market</h2>
            {priceContext.dataSource === "DEMO" && <DemoDataBadge />}
          </div>
          <PriceContextChart
            buckets={priceContext.distribution}
            quote={priceContext.quote}
            p25={priceContext.p25}
            median={priceContext.median}
            p75={priceContext.p75}
          />
        </section>
      </QuoteExplorer>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>
            How this price moved over 24 months
          </h2>
          {priceContext.dataSource === "DEMO" && <DemoDataBadge />}
        </div>
        <PriceHistoryTimeline
          history={priceContext.history}
          events={priceContext.events}
        />
      </section>

      {fuelEconomy && fuelCost !== null && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Cost to own: fuel</h2>
          </div>
          <p className={styles.fuelCost}>
            <strong>${fuelCost.toLocaleString("en-US")}</strong> per year
            <span className={styles.fuelDetail}>
              {" "}
              at {fuelEconomy.combinedMpg} MPG combined (EPA,{" "}
              {fuelEconomy.feModelName}, {fuelEconomy.fuelType.toLowerCase()}) —
              assuming {DEFAULT_MILES_PER_YEAR.toLocaleString("en-US")} miles/year
              and ${DEFAULT_DOLLARS_PER_GALLON.toFixed(2)}/gallon. Real data,
              explicit assumptions.
            </span>
          </p>
        </section>
      )}

      {/* AI narrates, math decides: the brief may only restate the
          server-computed numbers above. It's an enhancement — the verdict
          never depends on it (or on JavaScript). */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>AI deal brief</h2>
          <AiBadge />
        </div>
        <DealBrief
          make={parsed.make}
          year={parsed.year}
          model={parsed.model}
          quote={priceContext.quote}
        />
      </section>
    </main>
  );
}

function Header({ vehicleName }: { vehicleName: string }) {
  return (
    <>
      <div className={styles.topRow}>
        <p className={styles.breadcrumb}>
          <Link href="/">← Pick a different car</Link>
        </p>
        <ProvenanceBadge />
      </div>
      <h1 className={styles.title}>{vehicleName}</h1>
    </>
  );
}
