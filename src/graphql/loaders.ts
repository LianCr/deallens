import DataLoader from "dataloader";
import { fetchModelsForMakeYear, type VpicModel } from "@/sources/vpic";
import {
  fetchFuelEconomy,
  fetchFuelPrices,
  type FuelEconomy,
  type FuelPrices,
} from "@/sources/fueleconomy";

/**
 * Two cache tiers with different jobs:
 *
 *  1. DataLoader (per request): batches and deduplicates loads inside a
 *     single GraphQL operation, so a query that touches the same
 *     make+year from several fields costs one upstream call (N+1 guard).
 *  2. Module-level TTL cache (per server process): vPIC's model catalog
 *     changes on the timescale of model years, so we keep results for a
 *     day across requests instead of hammering a public API.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
/** Hard cap per cache: bounded memory even if someone scripts junk
 * queries at the public endpoint. Reset-on-full is fine at this scale. */
const CACHE_MAX_ENTRIES = 500;

function boundedSet<V>(cache: Map<string, V>, key: string, value: V): void {
  if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
  cache.set(key, value);
}

interface CacheEntry {
  models: VpicModel[];
  fetchedAt: number;
}

const modelCatalogCache = new Map<string, CacheEntry>();

async function loadModels(make: string, year: number): Promise<VpicModel[]> {
  const key = `${make.toLowerCase()}|${year}`;
  const cached = modelCatalogCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < DAY_MS) {
    return cached.models;
  }
  const models = await fetchModelsForMakeYear(make, year);
  boundedSet(modelCatalogCache, key, { models, fetchedAt: Date.now() });
  return models;
}

const fuelEconomyCache = new Map<
  string,
  { record: FuelEconomy | null; fetchedAt: number }
>();

/**
 * EPA figures for a model year never change; cache for a day (including
 * honest nulls, so an unmatched model doesn't retry on every render).
 */
export async function loadFuelEconomy(
  year: number,
  make: string,
  model: string,
): Promise<FuelEconomy | null> {
  const key = `${year}|${make.toLowerCase()}|${model.toLowerCase()}`;
  const cached = fuelEconomyCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < DAY_MS) {
    return cached.record;
  }
  const record = await fetchFuelEconomy(year, make, model);
  boundedSet(fuelEconomyCache, key, { record, fetchedAt: Date.now() });
  return record;
}

let fuelPricesCache: { prices: FuelPrices; fetchedAt: number } | null = null;

/**
 * The national average pump prices update weekly, so a day of staleness
 * is invisible. Failures are NOT cached: the next request retries, and
 * the resolver treats a throw as "no price this time" (see resolvers.ts)
 * rather than letting it take the MPG answer down.
 */
export async function loadFuelPrices(): Promise<FuelPrices> {
  if (fuelPricesCache && Date.now() - fuelPricesCache.fetchedAt < DAY_MS) {
    return fuelPricesCache.prices;
  }
  const prices = await fetchFuelPrices();
  fuelPricesCache = { prices, fetchedAt: Date.now() };
  return prices;
}

export interface Loaders {
  models: DataLoader<{ make: string; year: number }, VpicModel[], string>;
}

/** Fresh loaders per request — DataLoader caches must not leak between users. */
export function createLoaders(): Loaders {
  return {
    models: new DataLoader(
      async (keys) => Promise.all(keys.map((k) => loadModels(k.make, k.year))),
      { cacheKeyFn: (k) => `${k.make.toLowerCase()}|${k.year}` },
    ),
  };
}
