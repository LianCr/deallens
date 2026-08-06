import Link from "next/link";
import { redirect } from "next/navigation";
import { executeGraphQL } from "@/graphql/yoga";
import { dealPath } from "@/lib/vehicleUrl";
import { PickerForm } from "@/components/PickerForm/PickerForm";
import { NlFinder } from "@/components/NlFinder/NlFinder";
import styles from "./page.module.css";

/**
 * Landing — evidence-backed research first; classic picker remains as
 * the isomorphic shareable-deal path.
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
      vinError =
        "That VIN doesn't identify a vehicle. Check for typos, or pick the car manually below.";
    } catch (error) {
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

  if (hasMakeYear && selection.model && models.includes(selection.model)) {
    redirect(dealPath(selection.make!, year, selection.model, selection.quote || undefined));
  }

  return (
    <main className={styles.main}>
      <section className={styles.heroPlane} aria-label="DealLens">
        <div className={styles.heroGrid} aria-hidden="true" />
        <div className={styles.heroInner}>
          <h1 className={styles.title}>
            <span className={styles.brandMark} data-display>
              Deal<span className={styles.brandAccent}>Lens</span>
            </span>
            <span className={styles.titleLine}>Is this actually a good deal?</span>
          </h1>
          <p className={styles.tagline}>
            Evidence-backed price intelligence for high-consideration purchases — starting with
            used cars. Compare real offers, see the math, then get a grounded recommendation.
          </p>

          <div className={styles.primaryCta}>
            <div className={styles.finderBlock}>
              <h2 className={styles.ctaTitle}>Analyze a listing</h2>
              <p className={styles.ctaLead}>
                Paste a URL or enter make, model, year, mileage, and price — get citable comparables
              </p>
              <Link href="/research" className={styles.researchCta}>
                Open listing analyzer →
              </Link>
            </div>

            <div className={styles.secondaryPicker}>
              <h2 className={styles.secondaryTitle}>Or describe the car you want</h2>
              <p className={styles.ctaLead}>
                AI suggests models checked against the live NHTSA catalog
              </p>
              <NlFinder />
            </div>

            <div className={styles.secondaryPicker}>
              <h2 className={styles.secondaryTitle}>Or pick make, year, and model</h2>
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
            </div>
          </div>
        </div>
      </section>

      <section className={styles.belowFold}>
        <section className={styles.samples} aria-label="Example deals">
          <h2 className={styles.sectionTitle}>Try a shareable deal dashboard</h2>
          <p className={styles.sectionLead}>
            Server-rendered verdict with distribution + timeline — works with JavaScript disabled.
          </p>
          <ul className={styles.sampleList}>
            {SAMPLE_DEALS.map((sample) => (
              <li key={sample.href}>
                <Link href={sample.href} className={styles.sampleCard}>
                  <span className={styles.sampleVerdict}>{sample.verdict}</span>
                  <span className={styles.sampleVehicle}>{sample.vehicle}</span>
                  <span className={styles.sampleQuote}>
                    quoted at <span className="price-figure">{sample.quote}</span>
                  </span>
                  <span className={styles.sampleCta}>Open the lens →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <p className={styles.howLine}>
          <strong>How it works:</strong> controlled listing search (or labeled demo fallback) →
          normalize &amp; comparables → percentile &amp; Trust Trace → AI narrates evidence only.
          Vehicle catalog: NHTSA (real).
        </p>
      </section>
    </main>
  );
}

const SAMPLE_DEALS = [
  {
    vehicle: "2022 Honda Civic",
    quote: "$24,500",
    verdict: "Great deal",
    href: dealPath("Honda", 2022, "Civic", 24500),
  },
  {
    vehicle: "2022 Toyota RAV4",
    quote: "$31,200",
    verdict: "Fair price",
    href: dealPath("Toyota", 2022, "RAV4", 31200),
  },
  {
    vehicle: "2021 Ford F-150",
    quote: "$38,900",
    verdict: "Above market",
    href: dealPath("Ford", 2021, "F-150", 38900),
  },
];
