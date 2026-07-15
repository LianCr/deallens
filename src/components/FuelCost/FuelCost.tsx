"use client";

/**
 * FuelCost — the "Cost to own: fuel" sentence with its two assumptions
 * brought alive:
 *
 *  - The gas price is this week's real national average when the
 *    fueleconomy.gov weekly feed had one for this fuel (REAL data,
 *    attributed inline, unlabeled per the honesty rules); otherwise the
 *    sentence falls back to the explicit $3.60 assumption it always had.
 *  - The mileage assumption is a real number input embedded in the
 *    prose. Editing it reruns `annualFuelCost` — the *same imported
 *    pure function* the server used for the SSR figure. One function,
 *    two runtimes: that is the isomorphic-JavaScript story in one line.
 *
 * Without JavaScript nothing here degrades: the input server-renders
 * with its default value and the server-computed cost stands.
 */
import { useState } from "react";
import {
  annualFuelCost,
  DEFAULT_DOLLARS_PER_GALLON,
  DEFAULT_MILES_PER_YEAR,
} from "@/domain/fuelCost";
import styles from "./FuelCost.module.css";

/** Sanity bounds for the editable mileage assumption. */
export const MILES_MIN = 1_000;
export const MILES_MAX = 100_000;
export const MILES_STEP = 500;

const clampMiles = (miles: number): number =>
  Math.min(MILES_MAX, Math.max(MILES_MIN, Math.round(miles)));

export interface FuelCostProps {
  combinedMpg: number;
  feModelName: string;
  fuelType: string;
  /** This week's national average $/gallon, or null (no real price). */
  dollarsPerGallon: number | null;
  /** Attribution for the price, e.g. "fueleconomy.gov"; null with it. */
  priceSource: string | null;
}

export function FuelCost({
  combinedMpg,
  feModelName,
  fuelType,
  dollarsPerGallon,
  priceSource,
}: FuelCostProps) {
  // `miles` is the committed, clamped assumption the math uses; `draft`
  // is whatever is in the box, so mid-edit states ("2") don't yank the
  // figure around. Blur snaps the box back to the committed value.
  const [miles, setMiles] = useState(DEFAULT_MILES_PER_YEAR);
  const [draft, setDraft] = useState(String(DEFAULT_MILES_PER_YEAR));

  const hasRealPrice = dollarsPerGallon !== null;
  const cost = annualFuelCost({
    combinedMpg,
    milesPerYear: miles,
    dollarsPerGallon: dollarsPerGallon ?? DEFAULT_DOLLARS_PER_GALLON,
  });
  if (cost === null) return null;

  const handleChange = (value: string) => {
    setDraft(value);
    const parsed = Number(value);
    if (value !== "" && Number.isFinite(parsed)) {
      setMiles(clampMiles(parsed));
    }
  };

  return (
    <p className={styles.fuelCost} data-testid="fuel-cost">
      <strong className={styles.fuelFigure} data-testid="fuel-annual-cost">
        ${cost.toLocaleString("en-US")}
      </strong>{" "}
      per year
      <span className={styles.fuelDetail}>
        {" "}
        at {combinedMpg} MPG combined (EPA, {feModelName},{" "}
        {fuelType.toLowerCase()}) — assuming{" "}
        <input
          type="number"
          inputMode="numeric"
          className={styles.milesInput}
          value={draft}
          min={MILES_MIN}
          max={MILES_MAX}
          step={MILES_STEP}
          aria-label="Miles driven per year"
          data-testid="fuel-miles-input"
          onChange={(event) => handleChange(event.target.value)}
          onBlur={() => setDraft(String(miles))}
        />{" "}
        miles/year{" "}
        {hasRealPrice ? (
          <>
            at this week&apos;s national average {fuelType.toLowerCase()} price, $
            {dollarsPerGallon.toFixed(2)}/gallon
            {priceSource ? ` (${priceSource})` : ""}.
          </>
        ) : (
          <>and ${DEFAULT_DOLLARS_PER_GALLON.toFixed(2)}/gallon.</>
        )}{" "}
        Real data, explicit assumptions.
      </span>
    </p>
  );
}
