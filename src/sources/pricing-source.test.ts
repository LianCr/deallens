/**
 * PricingSource seam — demo source is deterministic; Marketcheck stub
 * stays unconfigured until a key is wired.
 */
import { describe, expect, test } from "vitest";
import {
  activePricingSource,
  demoPricingSource,
  marketcheckPricingSource,
} from "./pricing-source";
import type { PricingDataset } from "./pricing-gen";

describe("PricingSource", () => {
  test("demo source returns DEMO-tagged deterministic data", async () => {
    const a = (await demoPricingSource.getDataset(
      "Honda",
      "Civic",
      2022,
      "2026-08",
    )) as PricingDataset;
    const b = (await demoPricingSource.getDataset(
      "Honda",
      "Civic",
      2022,
      "2026-08",
    )) as PricingDataset;
    expect(a.dataSource).toBe("DEMO");
    expect(a.listings).toEqual(b.listings);
    expect(activePricingSource).toBe(demoPricingSource);
  });

  test("Marketcheck stub refuses until configured", () => {
    expect(() =>
      marketcheckPricingSource.getDataset("Honda", "Civic", 2022, "2026-08"),
    ).toThrow(/not configured/i);
  });
});
