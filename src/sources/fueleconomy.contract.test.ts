/**
 * Contract tests: the fueleconomy.gov client decodes REAL captured
 * payloads (see src/fixtures/fueleconomy) including the two nasty ones:
 * the literal `null` for unknown queries, and `menuItem` collapsing
 * from array to object when a menu has a single entry.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  fetchFuelEconomy,
  fetchFuelPrices,
  gallonPriceForFuelType,
  matchFeModel,
  normalizeMenuItems,
  parseFuelPrices,
  parseVehicleRecord,
} from "./fueleconomy";
import { UpstreamError } from "./errors";
import menuModels from "@/fixtures/fueleconomy/menu-model-honda-2022.json";
import menuModelsUnknown from "@/fixtures/fueleconomy/menu-model-unknown-make.json";
import menuOptionsCivic from "@/fixtures/fueleconomy/menu-options-civic-4dr-2022.json";
import menuOptionsInsight from "@/fixtures/fueleconomy/menu-options-insight-2022.json";
import vehicleCivic from "@/fixtures/fueleconomy/vehicle-44133-civic.json";
import fuelPrices from "@/fixtures/fueleconomy/fuelprices.json";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeMenuItems", () => {
  test("multi-entry menu stays an array (real Civic options payload)", () => {
    const items = normalizeMenuItems(menuOptionsCivic);
    expect(items.length).toBeGreaterThan(1);
    expect(items[0]).toHaveProperty("text");
    expect(items[0]).toHaveProperty("value");
  });

  test("single-entry menu arrives as an OBJECT and is normalized (real Insight payload)", () => {
    const items = normalizeMenuItems(menuOptionsInsight);
    expect(items).toHaveLength(1);
    expect(items[0]!.value).toBe("43948");
  });

  test("unknown make returns literal null → empty list, not a crash", () => {
    expect(normalizeMenuItems(menuModelsUnknown)).toEqual([]);
  });

  test("format drift fails loudly", () => {
    expect(() => normalizeMenuItems({ someOtherShape: [] })).toThrowError(
      UpstreamError,
    );
  });
});

describe("matchFeModel", () => {
  const feModels = normalizeMenuItems(menuModels).map((m) => m.text);

  test("vPIC 'Civic' matches the shortest FE variant", () => {
    expect(matchFeModel("Civic", feModels)).toBe("Civic 4Dr");
  });

  test("vPIC 'CR-V' matches despite punctuation differences", () => {
    expect(matchFeModel("CR-V", feModels)).toBe("CR-V AWD");
  });

  test("no confident match → null, never a forced pairing", () => {
    expect(matchFeModel("Odyssey Cargo Van", feModels)).toBeNull();
    expect(matchFeModel("", feModels)).toBeNull();
  });
});

describe("parseVehicleRecord", () => {
  test("string-typed MPG fields from the real payload parse to numbers", () => {
    const record = parseVehicleRecord(vehicleCivic, "Civic 4Dr");
    expect(record.combinedMpg).toBe(35);
    expect(record.fuelType).toBe("Regular");
  });

  test("record without usable comb08 fails loudly", () => {
    expect(() => parseVehicleRecord({ comb08: "0" }, "X")).toThrowError(
      UpstreamError,
    );
  });
});

describe("parseFuelPrices", () => {
  test("string-valued dollars from the real payload parse to numbers", () => {
    expect(parseFuelPrices(fuelPrices)).toEqual({
      regular: 4.15,
      midgrade: 4.76,
      premium: 5.14,
      diesel: 5.21,
    });
  });

  test("drift fails loudly: a missing gallon price is FORMAT, not garbage", () => {
    const withoutPremium: Record<string, unknown> = { ...fuelPrices };
    delete withoutPremium.premium;
    expect(() => parseFuelPrices(withoutPremium)).toThrowError(UpstreamError);
    expect(() => parseFuelPrices(withoutPremium)).toThrowError(/premium/);
  });

  test("drift fails loudly: non-numeric strings and null payloads", () => {
    expect(() =>
      parseFuelPrices({ ...fuelPrices, regular: "N/A" }),
    ).toThrowError(UpstreamError);
    expect(() => parseFuelPrices(null)).toThrowError(UpstreamError);
    expect(() => parseFuelPrices({ ...fuelPrices, diesel: "" })).toThrowError(
      UpstreamError,
    );
  });
});

describe("gallonPriceForFuelType", () => {
  const prices = parseFuelPrices(fuelPrices);

  test("EPA fuelType labels map case-insensitively to gallon prices", () => {
    expect(gallonPriceForFuelType("Regular", prices)).toBe(4.15);
    expect(gallonPriceForFuelType("Premium", prices)).toBe(5.14);
    expect(gallonPriceForFuelType("Diesel", prices)).toBe(5.21);
    expect(gallonPriceForFuelType("MIDGRADE", prices)).toBe(4.76);
  });

  test("fuels not sold by the gallon get null — electric $/kWh never enters gallon math", () => {
    expect(gallonPriceForFuelType("Electricity", prices)).toBeNull();
    expect(gallonPriceForFuelType("Regular Gas and Electricity", prices)).toBeNull();
    expect(gallonPriceForFuelType("", prices)).toBeNull();
  });
});

describe("fetchFuelPrices (end-to-end against the fixture)", () => {
  test("decodes the real weekly payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(fuelPrices), { status: 200 })),
    );
    await expect(fetchFuelPrices()).resolves.toEqual({
      regular: 4.15,
      midgrade: 4.76,
      premium: 5.14,
      diesel: 5.21,
    });
  });
});

describe("fetchFuelEconomy (end-to-end against fixtures)", () => {
  test("Civic: menu → fuzzy match → options → vehicle record → 35 MPG", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const payload = url.includes("/menu/model")
          ? menuModels
          : url.includes("/menu/options")
            ? menuOptionsCivic
            : vehicleCivic;
        return new Response(JSON.stringify(payload), { status: 200 });
      }),
    );
    await expect(fetchFuelEconomy(2022, "Honda", "Civic")).resolves.toEqual({
      combinedMpg: 35,
      feModelName: "Civic 4Dr",
      fuelType: "Regular",
    });
  });

  test("unknown model degrades honestly to null (fuel bar hidden, not faked)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(menuModels), { status: 200 })),
    );
    await expect(
      fetchFuelEconomy(2022, "Honda", "Some Model FE Never Heard Of"),
    ).resolves.toBeNull();
  });
});
