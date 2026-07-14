import { redirect } from "next/navigation";
import { executeGraphQL } from "@/graphql/yoga";
import { dealPath } from "@/lib/vehicleUrl";
import { PickerForm } from "@/components/PickerForm/PickerForm";
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
      <h1 className={styles.title}>DealLens</h1>
      <p className={styles.tagline}>
        Is this price fair? Pick a car, enter the dealer&apos;s quote, and see
        where it lands in the market — not just a number, but the context
        around it.
      </p>

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

      <p className={styles.dataNote}>
        Vehicle catalog: NHTSA vPIC (real, live). No account, no API keys.
      </p>
    </main>
  );
}
