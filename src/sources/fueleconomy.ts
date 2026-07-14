/**
 * fueleconomy.gov client — real EPA fuel-economy data.
 *
 * Field-tested behaviors this client is built around (see
 * src/fixtures/fueleconomy):
 *  - `Accept: application/json` works; no XML parsing needed.
 *  - Unknown make/model queries return the literal JSON `null`.
 *  - When a menu has exactly one entry, `menuItem` is an OBJECT, not a
 *    one-element array (a classic XML→JSON conversion artifact) — every
 *    menu read goes through normalizeMenuItems().
 *  - Model names disagree with vPIC ("Civic" vs "Civic 4Dr"), so we
 *    match fuzzily and degrade honestly (return null → the UI hides the
 *    fuel-cost bar) when nothing matches.
 *  - Numeric fields in vehicle records are strings ("35", not 35).
 */
import { UpstreamError, fetchUpstream } from "./errors";

const BASE = "https://www.fueleconomy.gov/ws/rest";
const SOURCE = "fueleconomy";
const JSON_HEADERS = { Accept: "application/json" };

interface MenuItem {
  text: string;
  value: string;
}

/** Normalize fueleconomy.gov's menu payloads: null | {menuItem: T | T[]}. */
export function normalizeMenuItems(payload: unknown): MenuItem[] {
  if (payload === null || payload === undefined) return [];
  const menuItem = (payload as { menuItem?: unknown }).menuItem;
  if (menuItem === undefined) {
    throw new UpstreamError("FORMAT", SOURCE, "expected a menuItem field");
  }
  const items = Array.isArray(menuItem) ? menuItem : [menuItem];
  return items.map((item) => {
    const { text, value } = item as Partial<MenuItem>;
    if (typeof text !== "string" || typeof value !== "string") {
      throw new UpstreamError("FORMAT", SOURCE, "menu item missing text/value");
    }
    return { text, value };
  });
}

/**
 * Match a vPIC model name against fueleconomy.gov's model list.
 * FE splits models into variants ("Civic 4Dr", "CR-V AWD"); the vPIC
 * name is usually a prefix of one or more variants. We take the
 * shortest matching variant (closest to the base model) and return
 * null when nothing matches — no forced pairing.
 */
export function matchFeModel(
  vpicModel: string,
  feModels: readonly string[],
): string | null {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = normalize(vpicModel);
  if (target === "") return null;

  const exact = feModels.find((m) => normalize(m) === target);
  if (exact) return exact;

  const prefixed = feModels
    .filter((m) => normalize(m).startsWith(target))
    .sort((a, b) => a.length - b.length);
  return prefixed[0] ?? null;
}

async function fetchMenu(url: string, init: RequestInit): Promise<MenuItem[]> {
  const response = await fetchUpstream(SOURCE, url, {
    ...init,
    headers: { ...JSON_HEADERS, ...init.headers },
  });
  return normalizeMenuItems(await response.json());
}

export interface FuelEconomy {
  /** EPA combined MPG. */
  combinedMpg: number;
  /** The fueleconomy.gov model variant the MPG belongs to. */
  feModelName: string;
  fuelType: string;
}

interface VehicleRecordPayload {
  comb08?: unknown;
  fuelType?: unknown;
}

export function parseVehicleRecord(
  payload: unknown,
  feModelName: string,
): FuelEconomy {
  const { comb08, fuelType } = (payload ?? {}) as VehicleRecordPayload;
  const combinedMpg = Number(comb08);
  if (!Number.isFinite(combinedMpg) || combinedMpg <= 0) {
    throw new UpstreamError("FORMAT", SOURCE, "vehicle record has no usable comb08");
  }
  return {
    combinedMpg,
    feModelName,
    fuelType: typeof fuelType === "string" ? fuelType : "Unknown",
  };
}

/**
 * Real combined MPG for a vPIC-named vehicle, or null when
 * fueleconomy.gov has no confident match — the caller shows nothing
 * rather than a guessed number.
 */
export async function fetchFuelEconomy(
  year: number,
  make: string,
  vpicModel: string,
  init: RequestInit = {},
): Promise<FuelEconomy | null> {
  const models = await fetchMenu(
    `${BASE}/vehicle/menu/model?year=${year}&make=${encodeURIComponent(make)}`,
    init,
  );
  const feModel = matchFeModel(vpicModel, models.map((m) => m.text));
  if (feModel === null) return null;

  const options = await fetchMenu(
    `${BASE}/vehicle/menu/options?year=${year}&make=${encodeURIComponent(
      make,
    )}&model=${encodeURIComponent(feModel)}`,
    init,
  );
  const first = options[0];
  if (!first) return null;

  const response = await fetchUpstream(
    SOURCE,
    `${BASE}/vehicle/${encodeURIComponent(first.value)}`,
    { ...init, headers: { ...JSON_HEADERS, ...init.headers } },
  );
  return parseVehicleRecord(await response.json(), feModel);
}
