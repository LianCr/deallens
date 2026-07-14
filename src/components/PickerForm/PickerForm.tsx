"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { dealPath } from "@/lib/vehicleUrl";
import styles from "./PickerForm.module.css";

interface Selection {
  make: string;
  year: string;
  model: string;
  quote: string;
}

interface PickerFormProps {
  makes: string[];
  years: number[];
  models: string[];
  selection: Selection;
  modelsError: string | null;
  vinError: string | null;
}

/**
 * The picker form, progressively enhanced.
 *
 * Without JavaScript this is a plain GET form: change a dropdown, hit
 * "Continue", and the server re-renders the page with the next level of
 * the cascade (all state lives in the URL).
 *
 * After hydration, changing make/year triggers the same navigation
 * instantly via router.replace inside a transition — the server still
 * does the data fetching, so there is exactly one code path for
 * populating models. Next.js cancels superseded transitions, which
 * covers the request-race concern without a hand-rolled AbortController.
 */
export function PickerForm({
  makes,
  years,
  models,
  selection,
  modelsError,
  vinError,
}: PickerFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  /**
   * Read the CURRENT form values from the DOM, not from props: two quick
   * changes (make, then year) would otherwise race the server round-trip
   * and the second navigation would drop the first choice.
   */
  const navigate = (form: HTMLFormElement, overrides: Partial<Selection> = {}) => {
    const data = new FormData(form);
    const params = new URLSearchParams();
    for (const key of ["make", "year", "model", "quote"] as const) {
      const value = overrides[key] ?? String(data.get(key) ?? "");
      if (value) params.set(key, value);
    }
    startTransition(() => {
      router.replace(`/?${params.toString()}`, { scroll: false });
    });
  };

  const modelsReady = models.length > 0;

  return (
    <>
      <form
        action="/"
        method="get"
        className={styles.form}
        aria-label="Pick a vehicle"
        onSubmit={(e) => {
          // Enhanced submit: jump straight to the deal page when the
          // selection is complete; otherwise re-render the cascade.
          // Without JS the same form GETs to "/" and the server does
          // the identical routing.
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          const make = String(data.get("make") ?? "");
          const year = Number(data.get("year"));
          const model = String(data.get("model") ?? "");
          const quote = String(data.get("quote") ?? "");
          if (make && model && Number.isInteger(year)) {
            router.push(dealPath(make, year, model, quote || undefined));
          } else {
            navigate(form);
          }
        }}
      >
        <div className={styles.grid}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="picker-make">
              Make
            </label>
            <select
              id="picker-make"
              name="make"
              defaultValue={selection.make}
              onChange={(e) => navigate(e.currentTarget.form!, { model: "" })}
              className={styles.select}
              required
            >
              <option value="">Choose a make…</option>
              {makes.map((make) => (
                <option key={make} value={make}>
                  {make}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="picker-year">
              Year
            </label>
            <select
              id="picker-year"
              name="year"
              defaultValue={selection.year}
              onChange={(e) => navigate(e.currentTarget.form!, { model: "" })}
              className={styles.select}
              required
            >
              <option value="">Choose a year…</option>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="picker-model">
              Model
            </label>
            <select
              id="picker-model"
              name="model"
              defaultValue={selection.model}
              // No onChange: picking a model loads nothing new from the
              // server, and navigating here would redirect to the deal
              // page before the shopper can type a quote.
              className={styles.select}
              disabled={!modelsReady}
              aria-busy={isPending}
            >
              <option value="">
                {modelsReady ? "Choose a model…" : "Pick make and year first"}
              </option>
              {models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="picker-quote">
              Dealer quote (optional)
            </label>
            <input
              id="picker-quote"
              name="quote"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              placeholder="e.g. 24500"
              defaultValue={selection.quote}
              className={styles.input}
            />
          </div>
        </div>

        {modelsError && (
          <p role="alert" className={styles.error}>
            {modelsError}
          </p>
        )}

        <button type="submit" className={styles.submit}>
          Continue
        </button>
      </form>

      <div className={styles.vinSection}>
        <h2 className={styles.vinTitle}>Have the VIN?</h2>
        <form action="/" method="get" className={styles.vinForm} aria-label="Decode a VIN">
          <input
            name="vin"
            type="text"
            aria-label="VIN"
            minLength={11}
            maxLength={17}
            placeholder="Paste a 17-character VIN"
            className={styles.input}
            aria-invalid={vinError ? true : undefined}
            required
          />
          <button type="submit" className={styles.submitSecondary}>
            Decode VIN
          </button>
        </form>
        {vinError && (
          <p role="alert" className={styles.error}>
            {vinError}
          </p>
        )}
      </div>
    </>
  );
}
