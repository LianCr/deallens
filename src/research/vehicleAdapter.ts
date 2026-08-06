/**
 * Vehicle research adapter — only vertical implemented in Phase 1–5.
 */

import type { ResearchAdapter } from "./adapter";
import {
  activeListingCollector,
  rawHitsToOffers,
  type RawListingHit,
} from "./collectors/listingCollector";
import { enrichTrim, selectComparables } from "./comparables";
import { ManualVehicleSchema, manualToTarget } from "./targetIntake";
import type {
  ComparableSet,
  NormalizedOffer,
  VehicleResearchRequest,
} from "./types";

export class VehicleResearchAdapter
  implements ResearchAdapter<VehicleResearchRequest, RawListingHit>
{
  readonly category = "VEHICLE" as const;

  async parseRequest(input: unknown): Promise<VehicleResearchRequest> {
    const parsed = ManualVehicleSchema.parse(input);
    const listingUrl =
      parsed.listingUrl && /^https?:\/\//i.test(parsed.listingUrl)
        ? parsed.listingUrl
        : undefined;
    const target = enrichTrim(
      manualToTarget({
        ...parsed,
        listingUrl,
      }),
    );
    const rawQuery = [
      parsed.year,
      parsed.make,
      parsed.model,
      parsed.price && `$${parsed.price}`,
      parsed.mileage != null && `${parsed.mileage} mi`,
      parsed.location,
    ]
      .filter(Boolean)
      .join(" ");
    return { category: "VEHICLE", rawQuery, target };
  }

  async collectEvidence(request: VehicleResearchRequest): Promise<RawListingHit[]> {
    const collector = activeListingCollector();
    return collector.collect({
      make: request.target.make,
      model: request.target.model,
      year: request.target.year,
      location: request.target.location,
    });
  }

  normalize(items: RawListingHit[]): NormalizedOffer[] {
    const first = items[0];
    if (!first) return [];
    const fallback = {
      make: first.make ?? "Unknown",
      model: first.model ?? "Unknown",
      year: first.year ?? new Date().getFullYear(),
    };
    return rawHitsToOffers(items, fallback).map(enrichTrim);
  }

  selectComparables(
    target: NormalizedOffer,
    candidates: NormalizedOffer[],
  ): ComparableSet {
    return selectComparables(target, candidates, {
      yearTolerance: 1,
      mileageTolerance: 40_000,
    });
  }
}

export const vehicleResearchAdapter = new VehicleResearchAdapter();
