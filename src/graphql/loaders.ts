import DataLoader from "dataloader";
import { fetchModelsForMakeYear, type VpicModel } from "@/sources/vpic";

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
  modelCatalogCache.set(key, { models, fetchedAt: Date.now() });
  return models;
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
