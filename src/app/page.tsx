import Link from "next/link";
import { redirect } from "next/navigation";
import { executeGraphQL } from "@/graphql/yoga";
import { dealPath } from "@/lib/vehicleUrl";
import { PickerForm } from "@/components/PickerForm/PickerForm";
import { NlFinder } from "@/components/NlFinder/NlFinder";
import styles from "./page.module.css";

/**
 * Page 1 — vehicle picker.
 *
 * Isomorphic by construction: the whole flow works as a plain GET form
 * (pick make → submit → server re-renders with years/models → …), and
 * a client component upgrades the same form to an instant cascade after
 * hydration. URL is the only state.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PickerParams {
  make?: string;
  year?: string;
  model?: string;
  quote?: string;
  vin?: string;
}

const param = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const selection: PickerParams = {
    make: param(params.make),
    year: param(params.year),
    model: param(params.model),
    quote: param(params.quote),
    vin: param(params.vin),
  };

  let vinError: string | null = null;
  if (selection.vin) {
    try {
      const { decodeVin } = await executeGraphQL<{
        decodeVin: { make: string; model: string; year: number } | null;
      }>(
        `query DecodeVin($vin: String!) {
          decodeVin(vin: $vin) { make model year }
        }`,
        { vin: selection.vin },
      );
      if (decodeVin) {
        redirect(dealPath(decodeVin.make, decodeVin.year, decodeVin.model));
      }
      vinError = "That VIN doesn't identify a vehicle. Check for typos, or pick the car manually below.";
    } catch (error) {
      // redirect() works by throwing — let it through.
      if (error && typeof error === "object" && "digest" in error) throw error;
      vinError = "The VIN decoder is unreachable right now. Pick the car manually below.";
    }
  }

  const { makes, years } = await executeGraphQL<{ makes: string[]; years: number[] }>(
    `query PickerLists { makes years }`,
  );

  const year = Number(selection.year);
  const hasMakeYear = Boolean(selection.make) && Number.isInteger(year) && years.includes(year);

  let models: string[] = [];
  let modelsError: string | null = null;
  if (hasMakeYear) {
    try {
      const data = await executeGraphQL<{ models: string[] }>(
        `query Models($make: String!, $year: Int!) { models(make: $make, year: $year) }`,
        { make: selection.make, year },
      );
      models = data.models;
    } catch {
      modelsError = "Couldn't reach the vehicle catalog (NHTSA). Try again in a moment.";
    }
  }

  // Complete selection → the dashboard owns the rest. Also canonicalizes
  // shared picker links.
  if (hasMakeYear && selection.model && models.includes(selection.model)) {
    redirect(dealPath(selection.make!, year, selection.model, selection.quote || undefined));
  }

  return (
    <main className={styles.main}>
      {/* Hero: static text only — this is the LCP element, so it ships
          zero client JS and never shifts. */}
      <section className={styles.hero}>
        <h1 className={styles.title}>
          DealLens<span className={styles.titleDot}>.</span> Is this price fair?
        </h1>
        <p className={styles.tagline}>
          Pick a car, enter the dealer&apos;s quote, and see where it lands in the
          market — not just a number, but the context around it.
        </p>
      </section>

      {/* AI is an on-ramp, not a dependency: everything below it works
          without AI (and without JavaScript). */}
      <section className={styles.finderSection} aria-label="Describe what you need">
        <NlFinder />
      </section>

      <section className={styles.pickerSection} aria-label="Pick the car yourself">
        <h2 className={styles.sectionTitle}>Or pick the car yourself</h2>
        <PickerForm
          makes={makes}
          years={years}
          models={models}
          selection={{
            make: selection.make ?? "",
            year: selection.year ?? "",
            model: selection.model ?? "",
            quote: selection.quote ?? "",
          }}
          modelsError={modelsError}
          vinError={vinError}
        />
      </section>

      <section className={styles.samples} aria-label="Example deals">
        <h2 className={styles.sectionTitle}>Or try a shared deal</h2>
        <ul className={styles.sampleList}>
          {SAMPLE_DEALS.map((sample) => (
            <li key={sample.href}>
              <Link href={sample.href} className={styles.sampleCard}>
                <span className={styles.sampleVehicle}>{sample.vehicle}</span>
                <span className={styles.sampleQuote}>quoted at {sample.quote}</span>
                <span className={styles.sampleCta}>See the verdict →</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.how} aria-label="How it works">
        <h2 className={styles.sectionTitle}>How it works</h2>
        <ol className={styles.howSteps}>
          <li className={styles.howStep}>
            <strong>Pick a real car.</strong> Make, year, and model come live from
            the NHTSA catalog — or paste a VIN.
          </li>
          <li className={styles.howStep}>
            <strong>Enter the dealer&apos;s quote.</strong> The verdict is computed
            server-side: percentile, median delta, 24 months of price history.
          </li>
          <li className={styles.howStep}>
            <strong>Negotiate with context.</strong> A shareable link, honest data
            labels, and an AI brief grounded in the same numbers.
          </li>
        </ol>
      </section>

      <p className={styles.dataNote}>
        Vehicle catalog: NHTSA vPIC (real, live). No account, no API keys.
      </p>
    </main>
  );
}

const SAMPLE_DEALS = [
  {
    vehicle: "2022 Honda Civic",
    quote: "$24,500",
    href: dealPath("Honda", 2022, "Civic", 24500),
  },
  {
    vehicle: "2022 Toyota RAV4",
    quote: "$31,200",
    href: dealPath("Toyota", 2022, "RAV4", 31200),
  },
  {
    vehicle: "2021 Ford F-150",
    quote: "$38,900",
    href: dealPath("Ford", 2021, "F-150", 38900),
  },
];
