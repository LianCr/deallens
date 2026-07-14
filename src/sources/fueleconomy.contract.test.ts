/**
 * Contract tests: the fueleconomy.gov client decodes REAL captured
 * payloads (see src/fixtures/fueleconomy) including the two nasty ones:
 * the literal `null` for unknown queries, and `menuItem` collapsing
 * from array to object when a menu has a single entry.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  fetchFuelEconomy,
  matchFeModel,
  normalizeMenuItems,
  parseVehicleRecord,
} from "./fueleconomy";
import { UpstreamError } from "./errors";
import menuModels from "@/fixtures/fueleconomy/menu-model-honda-2022.json";
import menuModelsUnknown from "@/fixtures/fueleconomy/menu-model-unknown-make.json";
import menuOptionsCivic from "@/fixtures/fueleconomy/menu-options-civic-4dr-2022.json";
import menuOptionsInsight from "@/fixtures/fueleconomy/menu-options-insight-2022.json";
import vehicleCivic from "@/fixtures/fueleconomy/vehicle-44133-civic.json";

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
