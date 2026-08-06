export type {
  ResearchCategory,
  ResearchSession,
  SourceEvidence,
  NormalizedOffer,
  PriceObservation,
  ComparableSet,
  EvidenceBundle,
  StructuredResearchRecommendation,
  ManualVehicleInput,
  VehicleResearchRequest,
} from "./types";

export { vehicleResearchAdapter } from "./vehicleAdapter";
export { laptopResearchAdapter } from "./laptopAdapter";
export { runVehicleResearch } from "./pipeline";
export { activeListingCollector } from "./collectors/listingCollector";
