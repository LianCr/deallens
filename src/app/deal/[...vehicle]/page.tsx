import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { executeGraphQL } from "@/graphql/yoga";
import { dealPath, parseVehicleSegments, titleCase } from "@/lib/vehicleUrl";
import type { PriceBucket, MarketEvent, PricePoint, Verdict } from "@/domain/types";
import { percentileValue } from "@/domain/percentile";
import { annualFuelCost } from "@/domain/fuelCost";
import { activePricingSource } from "@/sources/pricing-source";
import { PriceContextChart } from "@/components/charts/PriceContextChart";
import { PriceHistoryTimeline } from "@/components/charts/PriceHistoryTimeline";
import { DemoDataBadge, ProvenanceBadge } from "@/components/DataBadge/DataBadge";
import { AiBadge, DealBrief } from "@/components/DealBrief/DealBrief";
import { AskThread } from "@/components/DealBrief/AskThread";
import { FuelCost } from "@/components/FuelCost/FuelCost";
import { QuoteExplorer } from "@/components/QuoteExplorer/QuoteExplorer";
import { WhenToBuy } from "@/components/WhenToBuy/WhenToBuy";
import styles from "./page.module.css";

/**
 * Page 2 — Deal Dashboard. URL shape: /deal/{make}/{year}/{model}?quote=…
 * The URL is the whole state: shareable, and the verdict is computed
 * server-side so the conclusion is readable with JavaScript disabled.
 *
 * Missing / invalid quote → seed at market median (`?quote=…&seed=median`)
 * so the full dashboard is the default, not a blocking form.
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
  /** This week's national average $/gallon; null = no real price. */
  dollarsPerGallon: number | null;
  priceSource: string | null;
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

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
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
  const hasQuote = Number.isInteger(quote) && quote > 0 && quote <= QUOTE_MAX;

  const vehicleName = `${parsed.year} ${titleCase(parsed.make)} ${titleCase(parsed.model)}`;
  const selfPath = dealPath(parsed.make, parsed.year, parsed.model);

  // No dealer quote yet (or a junk value) → land on the full dashboard
  // seeded at the market median. QuoteExplorer is the place to adjust.
  if (!hasQuote) {
    const dataset = await activePricingSource.getDataset(
      parsed.make,
      parsed.model,
      parsed.year,
      currentMonthKey(),
    );
    const median = percentileValue(dataset.listings, 50);
    const seedQuote =
      median !== null
        ? Math.round(median)
        : Math.round(dataset.listings[0] ?? 25_000);
    redirect(`${selfPath}?quote=${seedQuote}&seed=median`);
  }

  const seedRaw = Array.isArray(query.seed) ? query.seed[0] : query.seed;
  const seededFromMedian = seedRaw === "median";

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
          combinedMpg feModelName fuelType dollarsPerGallon priceSource
        }
      }`,
      { make: parsed.make, model: parsed.model, year: parsed.year },
    ).then(
      (data) => data.fuelEconomy,
      () => null,
    ),
  ]);

  // Visibility guard only — the FuelCost island reruns this same pure
  // function (deterministic, so server and island agree) and owns the
  // displayed figure, including live mileage edits.
  const fuelCost = fuelEconomy
    ? annualFuelCost({
        combinedMpg: fuelEconomy.combinedMpg,
        dollarsPerGallon: fuelEconomy.dollarsPerGallon ?? undefined,
      })
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
        seededFromMedian={seededFromMedian}
        dataSource={priceContext.dataSource}
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
        {/* Caption-grade seasonal hint; renders nothing when the data
            is too thin or the dip is noise — absence is the honest
            state, and the timeline's empty state covers thin markets. */}
        <WhenToBuy history={priceContext.history} />
      </section>

      {fuelEconomy && fuelCost !== null && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Cost to own: fuel</h2>
          </div>
          <FuelCost
            combinedMpg={fuelEconomy.combinedMpg}
            feModelName={fuelEconomy.feModelName}
            fuelType={fuelEconomy.fuelType}
            dollarsPerGallon={fuelEconomy.dollarsPerGallon}
            priceSource={fuelEconomy.priceSource}
          />
        </section>
      )}

      {/* Optional AI narration — FunFact demoted off this page; brief stays available. */}
      <details className={styles.aiExtras} open>
        <summary className={styles.aiExtrasSummary}>
          Optional AI extras — narrates the numbers above
        </summary>

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
          <AskThread
            make={parsed.make}
            year={parsed.year}
            model={parsed.model}
            quote={priceContext.quote}
          />
        </section>
      </details>
    </main>
  );
}

function Header({ vehicleName }: { vehicleName: string }) {
  return (
    <>
      <div className={styles.topRow}>
        <p className={styles.breadcrumb}>
          <Link href="/">← Pick a different car</Link>
          {" · "}
          <Link href="/research">Analyze a listing</Link>
        </p>
        <ProvenanceBadge />
      </div>
      <h1 className={styles.title}>{vehicleName}</h1>
    </>
  );
}
