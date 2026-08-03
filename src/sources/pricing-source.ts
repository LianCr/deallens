/**
 * PricingSource — the adapter seam for market pricing data.
 *
 * Production currently uses the deterministic demo generator
 * (`demoPricingSource`). A live vendor (Marketcheck, etc.) implements
 * the same interface and returns `dataSource: "REAL"`; the GraphQL
 * `PriceContext` resolver and UI badges stay unchanged.
 */
import type { PricingDataset } from "./pricing-gen";
import { generatePricingDataset } from "./pricing-gen";

export interface PricingSource {
  /**
   * Fetch (or generate) the market context for one vehicle.
   * `asOf` is an ISO "YYYY-MM" anchor so implementations stay pure
   * with respect to the clock when desired.
   */
  getDataset(
    make: string,
    model: string,
    year: number,
    asOf: string,
  ): PricingDataset | Promise<PricingDataset>;
}

/** Default source: labeled synthetic data. */
export const demoPricingSource: PricingSource = {
  getDataset(make, model, year, asOf) {
    return generatePricingDataset(make, model, year, asOf);
  },
};

/**
 * Placeholder for a paid transaction-price API. Throws until wired —
 * kept in-tree so the REAL schema tag and README adapter story have a
 * concrete type to point at.
 */
export const marketcheckPricingSource: PricingSource = {
  getDataset() {
    throw new Error(
      "Marketcheck adapter is not configured — use demoPricingSource or implement getDataset()",
    );
  },
};

/** Active source for the GraphQL gateway. Swap here to go live. */
export const activePricingSource: PricingSource = demoPricingSource;
