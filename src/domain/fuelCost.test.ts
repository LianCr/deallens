import { describe, expect, test } from "vitest";
import { annualFuelCost } from "./fuelCost";

describe("annualFuelCost", () => {
  test("computes miles / mpg * price, rounded to whole dollars", () => {
    // 12000 / 35 * 3.6 = 1234.28... → 1234
    expect(annualFuelCost({ combinedMpg: 35 })).toBe(1234);
  });

  test("honors explicit assumptions", () => {
    expect(
      annualFuelCost({
        combinedMpg: 30,
        milesPerYear: 15_000,
        dollarsPerGallon: 4,
      }),
    ).toBe(2000);
  });

  test("returns null for nonsense MPG instead of a made-up number", () => {
    expect(annualFuelCost({ combinedMpg: 0 })).toBeNull();
    expect(annualFuelCost({ combinedMpg: -5 })).toBeNull();
    expect(annualFuelCost({ combinedMpg: NaN })).toBeNull();
    expect(annualFuelCost({ combinedMpg: Infinity })).toBeNull();
  });

  test("returns null for negative assumptions", () => {
    expect(annualFuelCost({ combinedMpg: 30, milesPerYear: -1 })).toBeNull();
    expect(annualFuelCost({ combinedMpg: 30, dollarsPerGallon: -1 })).toBeNull();
  });
});
