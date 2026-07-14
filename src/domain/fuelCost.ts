/**
 * Annual fuel cost from a combined MPG figure. The assumptions are
 * explicit, visible in the UI, and adjustable — they are part of the
 * answer, not hidden constants.
 */
export const DEFAULT_MILES_PER_YEAR = 12_000;
export const DEFAULT_DOLLARS_PER_GALLON = 3.6;

export function annualFuelCost({
  combinedMpg,
  milesPerYear = DEFAULT_MILES_PER_YEAR,
  dollarsPerGallon = DEFAULT_DOLLARS_PER_GALLON,
}: {
  combinedMpg: number;
  milesPerYear?: number;
  dollarsPerGallon?: number;
}): number | null {
  if (
    !Number.isFinite(combinedMpg) ||
    combinedMpg <= 0 ||
    milesPerYear < 0 ||
    dollarsPerGallon < 0
  ) {
    // Invalid inputs get an honest null, not a made-up number.
    return null;
  }
  return Math.round((milesPerYear / combinedMpg) * dollarsPerGallon);
}
