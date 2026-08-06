/**
 * Thin research adapter contract — one implementation per vertical.
 * Does not replace the car GraphQL schema.
 */

import type { ComparableSet, NormalizedOffer } from "./types";

export interface ResearchAdapter<TRequest, TRaw> {
  readonly category: TRequest extends { category: infer C } ? C : string;
  parseRequest(input: unknown): Promise<TRequest>;
  collectEvidence(request: TRequest): Promise<TRaw[]>;
  normalize(items: TRaw[]): NormalizedOffer[];
  selectComparables(
    target: NormalizedOffer,
    candidates: NormalizedOffer[],
  ): ComparableSet;
}
