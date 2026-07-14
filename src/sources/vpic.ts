/**
 * NHTSA vPIC client — real vehicle catalog data.
 *
 * Field-tested behaviors this client is built around (see src/fixtures/vpic):
 *  - Unknown makes return HTTP 200 with an empty `Results` array, not 404.
 *  - An unfiltered models query mixes in motorcycles (Gold Wing, PCX150…),
 *    so we query the `car`, `mpv`, and `truck` vehicle types in parallel
 *    and merge — Civic is a Passenger Car, CR-V/Pilot are MPVs, and
 *    Ridgeline is a Truck; dropping any one type loses real models.
 *  - VIN decoding returns HTTP 200 with a non-zero `ErrorCode` field for
 *    invalid VINs; errors are detected from the payload, never the status.
 */
import { UpstreamError, fetchUpstream } from "./errors";

const BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";
const SOURCE = "vpic";

/** Consumer vehicle types worth showing in a car-shopping picker. */
const VEHICLE_TYPES = ["car", "mpv", "truck"] as const;

export interface VpicModel {
  modelId: number;
  name: string;
  vehicleType: string;
}

interface VpicModelsPayload {
  Results: Array<{
    Model_ID: number;
    Model_Name: string;
    VehicleTypeName?: string;
  }>;
}

function parseModelsPayload(payload: unknown): VpicModelsPayload {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !Array.isArray((payload as { Results?: unknown }).Results)
  ) {
    // Format drift fails loudly — a silently-empty picker would look
    // like "no models" when the real story is "the API changed shape".
    throw new UpstreamError("FORMAT", SOURCE, "expected a Results array");
  }
  return payload as VpicModelsPayload;
}

/**
 * All consumer models for a make + model year, merged across the three
 * consumer vehicle types and deduplicated by model id.
 * An empty array is a real answer (unknown make / no models that year).
 */
export async function fetchModelsForMakeYear(
  make: string,
  year: number,
  init: RequestInit = {},
): Promise<VpicModel[]> {
  const payloads = await Promise.all(
    VEHICLE_TYPES.map(async (type) => {
      const url = `${BASE}/GetModelsForMakeYear/make/${encodeURIComponent(
        make,
      )}/modelyear/${year}/vehicletype/${type}?format=json`;
      const response = await fetchUpstream(SOURCE, url, init);
      return parseModelsPayload(await response.json());
    }),
  );

  const byId = new Map<number, VpicModel>();
  for (const payload of payloads) {
    for (const row of payload.Results) {
      if (typeof row.Model_ID !== "number" || typeof row.Model_Name !== "string") {
        throw new UpstreamError("FORMAT", SOURCE, "model row missing id or name");
      }
      if (!byId.has(row.Model_ID)) {
        byId.set(row.Model_ID, {
          modelId: row.Model_ID,
          name: row.Model_Name,
          vehicleType: row.VehicleTypeName ?? "Unknown",
        });
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface VinDecodeResult {
  make: string;
  model: string;
  year: number;
  /** Non-fatal decoder complaints (e.g. a failed check digit). */
  warning: string | null;
}

interface VinDecodePayload {
  Results: Array<Record<string, string>>;
}

function parseVinPayload(payload: unknown): Record<string, string> {
  const results = (payload as VinDecodePayload | null)?.Results;
  if (!Array.isArray(results) || results.length === 0 || typeof results[0] !== "object") {
    throw new UpstreamError("FORMAT", SOURCE, "expected Results[0] from VIN decode");
  }
  return results[0]!;
}

/**
 * Decode a VIN to make/model/year.
 * Returns null when the VIN doesn't identify a vehicle — vPIC signals
 * this with HTTP 200 + a populated ErrorCode and empty core fields.
 * A decodable VIN with a non-zero ErrorCode (e.g. bad check digit)
 * is accepted with a warning rather than rejected.
 */
export async function decodeVin(
  vin: string,
  init: RequestInit = {},
): Promise<VinDecodeResult | null> {
  const url = `${BASE}/DecodeVinValues/${encodeURIComponent(vin.trim())}?format=json`;
  const response = await fetchUpstream(SOURCE, url, init);
  const row = parseVinPayload(await response.json());

  const make = row.Make ?? "";
  const model = row.Model ?? "";
  const year = Number(row.ModelYear ?? "");
  // Number("") is 0, so an empty ModelYear must fail the range check,
  // not just the integer check.
  if (!make || !model || !Number.isInteger(year) || year < 1980) {
    return null;
  }
  const hasError = row.ErrorCode !== undefined && !/^0\b/.test(row.ErrorCode);
  return {
    make,
    model,
    year,
    warning: hasError ? (row.ErrorText ?? "VIN decoded with warnings") : null,
  };
}
