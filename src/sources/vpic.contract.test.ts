/**
 * Contract tests: the vPIC client decodes REAL captured payloads (see
 * src/fixtures/vpic, fetched from the live API) and fails loudly on
 * format drift instead of silently returning nothing.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { UpstreamError } from "./errors";
import { decodeVin, fetchModelsForMakeYear } from "./vpic";
import modelsCar from "@/fixtures/vpic/models-honda-2022-car.json";
import modelsMpv from "@/fixtures/vpic/models-honda-2022-mpv.json";
import modelsTruck from "@/fixtures/vpic/models-honda-2022-truck.json";
import modelsEmpty from "@/fixtures/vpic/models-unknown-make-empty.json";
import vinWarning from "@/fixtures/vpic/vin-decode-check-digit-warning.json";
import vinInvalid from "@/fixtures/vpic/vin-decode-invalid.json";

function mockFetchByUrl(routes: Array<[match: string, payload: unknown]>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const route = routes.find(([match]) => url.includes(match));
      if (!route) throw new Error(`unexpected fetch: ${url}`);
      return new Response(JSON.stringify(route[1]), { status: 200 });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchModelsForMakeYear", () => {
  test("merges car + mpv + truck and sorts by name (real 2022 Honda data)", async () => {
    mockFetchByUrl([
      ["/vehicletype/car", modelsCar],
      ["/vehicletype/mpv", modelsMpv],
      ["/vehicletype/truck", modelsTruck],
    ]);
    const models = await fetchModelsForMakeYear("honda", 2022);
    const names = models.map((m) => m.name);
    // One representative from each vehicle type must survive the merge.
    expect(names).toContain("Civic"); // Passenger Car
    expect(names).toContain("CR-V"); // MPV
    expect(names).toContain("Ridgeline"); // Truck
    // Motorcycles are structurally excluded by the type filter.
    expect(names).not.toContain("Gold Wing");
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  test("unknown make: HTTP 200 + empty Results is a real, non-error answer", async () => {
    mockFetchByUrl([
      ["/vehicletype/car", modelsEmpty],
      ["/vehicletype/mpv", modelsEmpty],
      ["/vehicletype/truck", modelsEmpty],
    ]);
    await expect(fetchModelsForMakeYear("notarealmake", 2022)).resolves.toEqual([]);
  });

  test("format drift fails loudly, never silently empty", async () => {
    mockFetchByUrl([["/vehicletype/", { TotallyNew: "shape" }]]);
    await expect(fetchModelsForMakeYear("honda", 2022)).rejects.toThrowError(
      UpstreamError,
    );
  });
});

describe("decodeVin", () => {
  test("decodable VIN with a failed check digit → result with warning", async () => {
    mockFetchByUrl([["/DecodeVinValues/", vinWarning]]);
    const result = await decodeVin("1HGCV1F34NA012345");
    expect(result).toMatchObject({ make: "HONDA", model: "Accord", year: 2022 });
    expect(result!.warning).toBeTruthy();
  });

  test("garbage VIN (HTTP 200, ErrorCode set, empty core fields) → null", async () => {
    mockFetchByUrl([["/DecodeVinValues/", vinInvalid]]);
    await expect(decodeVin("INVALIDVIN123")).resolves.toBeNull();
  });
});
