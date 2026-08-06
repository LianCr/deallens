/**
 * Research evidence model — sits beside the car-specific GraphQL API,
 * not a generic Product/EAV layer. Future verticals add a category +
 * adapter; they do not rewrite Vehicle fields into attributes.
 */

import type { DataSourceTag, Verdict } from "@/domain/types";

export type ResearchCategory = "VEHICLE" | "LAPTOP";

export type ResearchStatus =
  | "PENDING"
  | "COLLECTING"
  | "ANALYZING"
  | "COMPLETE"
  | "FAILED";

export type EvidenceType = "LISTING" | "SPECIFICATION" | "RECALL" | "REVIEW";

export type ConfidenceLabel = "LOW" | "MEDIUM" | "HIGH";

export interface ResearchSession {
  id: string;
  query: string;
  category: ResearchCategory;
  status: ResearchStatus;
  createdAt: string;
  /** ISO timestamp when analysis finished (if any). */
  completedAt?: string;
}

export interface SourceEvidence {
  id: string;
  sourceName: string;
  sourceUrl: string;
  retrievedAt: string;
  evidenceType: EvidenceType;
  /** 0–1 extraction confidence for structured fields from this source. */
  extractionConfidence: number;
  dataSource: DataSourceTag | "SEARCH_EXTRACTED";
}

export interface ManualVehicleInput {
  make: string;
  model: string;
  year: number;
  price: number;
  mileage?: number;
  location?: string;
  trim?: string;
  listingUrl?: string;
}

export interface NormalizedOffer {
  id: string;
  category: ResearchCategory;
  title: string;
  make: string;
  model: string;
  year: number;
  trim?: string;
  price: number;
  mileage?: number;
  condition?: "USED" | "CPO" | "NEW";
  location?: string;
  source: SourceEvidence;
  /** Optional VIN when known — used for dedupe. */
  vin?: string;
}

export interface PriceObservation {
  id: string;
  sourceId: string;
  offerId: string;
  price: number;
  observedAt: string;
  currency: "USD";
  condition?: string;
  location?: string;
  mileage?: number;
  year?: number;
  trim?: string;
}

export interface ComparableExclusion {
  itemId: string;
  reason: string;
}

export interface ComparableSet {
  targetId: string;
  included: NormalizedOffer[];
  observations: PriceObservation[];
  median: number | null;
  p25: number | null;
  p75: number | null;
  mean: number | null;
  sampleSize: number;
  confidence: ConfidenceLabel;
  confidenceScore: number;
  exclusions: ComparableExclusion[];
  missingTrimCount: number;
}

export interface VehicleResearchRequest {
  category: "VEHICLE";
  rawQuery: string;
  target: NormalizedOffer;
  /** Optional mileage window for comparable selection (± miles). */
  mileageTolerance?: number;
  yearTolerance?: number;
}

export interface StructuredResearchRecommendation {
  recommendation: string;
  reasoning: string;
  bestValueOption?: string;
  cheapestAcceptableOption?: string;
  premiumOption?: string;
  risks: string[];
  followUpQuestions: string[];
  confidenceExplanation: string;
  evidenceIds: string[];
}

export interface EvidenceBundle {
  session: ResearchSession;
  target: NormalizedOffer;
  comparables: ComparableSet;
  verdict: Verdict;
  percentile: number | null;
  explainSteps: Array<{ id: string; label: string; detail: string }>;
  dataSource: DataSourceTag | "SEARCH_EXTRACTED" | "MIXED";
  collectorMode: "LIVE_SEARCH" | "DEMO_FALLBACK";
}

export interface ResearchReportPayload {
  bundle: EvidenceBundle;
  ai: StructuredResearchRecommendation | null;
}
