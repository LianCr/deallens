/**
 * URL-as-state helpers for the deal dashboard.
 * /deal/{make}/{year}/{model}?quote=… is the app's only source of truth
 * for "which deal are we looking at" — shareable and server-renderable.
 */

export function dealPath(
  make: string,
  year: number,
  model: string,
  quote?: string | number,
): string {
  const base = `/deal/${encodeURIComponent(make.toLowerCase())}/${year}/${encodeURIComponent(
    model.toLowerCase(),
  )}`;
  return quote !== undefined && quote !== ""
    ? `${base}?quote=${encodeURIComponent(String(quote))}`
    : base;
}

export interface ParsedVehicle {
  make: string;
  year: number;
  model: string;
}

/** Parse catch-all segments back into a vehicle; null = malformed URL. */
export function parseVehicleSegments(segments: string[]): ParsedVehicle | null {
  if (segments.length < 3) return null;
  const [rawMake, rawYear, ...modelParts] = segments;
  const make = decodeURIComponent(rawMake!);
  const year = Number(rawYear);
  const model = modelParts.map(decodeURIComponent).join(" ");
  if (!make || !model || !Number.isInteger(year)) return null;
  return { make, year, model };
}

export const titleCase = (s: string): string =>
  s.replace(/\b\w/g, (c) => c.toUpperCase());
