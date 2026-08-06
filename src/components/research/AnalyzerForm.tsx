"use client";

import { useState, useTransition } from "react";
import styles from "./AnalyzerForm.module.css";

export interface AnalyzerValues {
  make: string;
  model: string;
  year: string;
  price: string;
  mileage: string;
  location: string;
  trim: string;
  listingUrl: string;
}

const empty: AnalyzerValues = {
  make: "Honda",
  model: "Civic",
  year: "2022",
  price: "24500",
  mileage: "42000",
  location: "Los Angeles, CA",
  trim: "",
  listingUrl: "",
};

interface Props {
  onResult: (payload: unknown) => void;
}

export function AnalyzerForm({ onResult }: Props) {
  const [values, setValues] = useState<AnalyzerValues>(empty);
  const [error, setError] = useState<string | null>(null);
  const [urlWarning, setUrlWarning] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set =
    (key: keyof AnalyzerValues) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setValues((v) => ({ ...v, [key]: e.target.value }));
    };

  const parseUrl = () => {
    setError(null);
    setUrlWarning(null);
    const url = values.listingUrl.trim();
    if (!url) {
      setError("Paste a listing URL first.");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/research/parse-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as {
        partial?: Partial<AnalyzerValues> & { year?: number; price?: number; mileage?: number };
        warnings?: string[];
        message?: string;
      };
      if (!res.ok && !data.partial) {
        setError(data.message ?? "Could not parse that URL.");
        return;
      }
      const p = data.partial ?? {};
      setValues((v) => ({
        ...v,
        listingUrl: url,
        make: typeof p.make === "string" ? p.make : v.make,
        model: typeof p.model === "string" ? p.model : v.model,
        year: p.year != null ? String(p.year) : v.year,
        price: p.price != null ? String(p.price) : v.price,
        mileage: p.mileage != null ? String(p.mileage) : v.mileage,
        trim: typeof p.trim === "string" ? p.trim : v.trim,
      }));
      if (data.warnings?.length) setUrlWarning(data.warnings.join(" "));
      if (!res.ok) setError(data.message ?? "Partial parse — confirm fields below.");
    });
  };

  const analyze = () => {
    setError(null);
    startTransition(async () => {
      const body = {
        make: values.make.trim(),
        model: values.model.trim(),
        year: Number(values.year),
        price: Number(values.price),
        mileage: values.mileage ? Number(values.mileage) : undefined,
        location: values.location.trim() || undefined,
        trim: values.trim.trim() || undefined,
        listingUrl: values.listingUrl.trim() || undefined,
      };
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Research failed.");
        return;
      }
      onResult(data);
    });
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.urlRow}>
        <label className={styles.label} htmlFor="listingUrl">
          Listing URL <span className={styles.optional}>(optional)</span>
        </label>
        <div className={styles.urlControls}>
          <input
            id="listingUrl"
            className={styles.input}
            type="url"
            placeholder="https://…"
            value={values.listingUrl}
            onChange={set("listingUrl")}
          />
          <button type="button" className={styles.secondaryBtn} onClick={parseUrl} disabled={pending}>
            Parse URL
          </button>
        </div>
        {urlWarning && <p className={styles.warn}>{urlWarning}</p>}
      </div>

      <div className={styles.grid}>
        <Field label="Make" id="make" value={values.make} onChange={set("make")} required />
        <Field label="Model" id="model" value={values.model} onChange={set("model")} required />
        <Field label="Year" id="year" value={values.year} onChange={set("year")} required inputMode="numeric" />
        <Field label="Asking price ($)" id="price" value={values.price} onChange={set("price")} required inputMode="numeric" />
        <Field label="Mileage" id="mileage" value={values.mileage} onChange={set("mileage")} inputMode="numeric" />
        <Field label="Location" id="location" value={values.location} onChange={set("location")} />
        <Field label="Trim" id="trim" value={values.trim} onChange={set("trim")} />
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <button type="button" className={styles.primaryBtn} onClick={analyze} disabled={pending}>
        {pending ? "Researching…" : "Analyze this listing"}
      </button>
      <p className={styles.hint}>
        Comparables come from a controlled search API when configured; otherwise a labeled demo
        catalog. Every row keeps a source link.
      </p>
    </div>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  required,
  inputMode,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required ? "" : <span className={styles.optional}> (optional)</span>}
      </label>
      <input
        id={id}
        className={styles.input}
        value={value}
        onChange={onChange}
        required={required}
        inputMode={inputMode}
      />
    </div>
  );
}
