/**
 * Curated make whitelist.
 *
 * vPIC's full make table has thousands of entries — one-off importers,
 * trailer manufacturers, defunct badges. A shopper picking a car needs
 * ~30 household names, so this list is a product decision maintained in
 * code (and documented in the README), not an API passthrough.
 */
export const MAKES = [
  "Acura",
  "Audi",
  "BMW",
  "Buick",
  "Cadillac",
  "Chevrolet",
  "Chrysler",
  "Dodge",
  "Ford",
  "GMC",
  "Honda",
  "Hyundai",
  "Infiniti",
  "Jeep",
  "Kia",
  "Lexus",
  "Lincoln",
  "Mazda",
  "Mercedes-Benz",
  "MINI",
  "Mitsubishi",
  "Nissan",
  "Porsche",
  "Ram",
  "Subaru",
  "Tesla",
  "Toyota",
  "Volkswagen",
  "Volvo",
] as const;

/** Model years offered by the picker, newest first — anchored to the
 * clock so the demo doesn't silently go stale next January. */
export const YEARS = Array.from(
  { length: 12 },
  (_, i) => new Date().getUTCFullYear() - i,
);

/** Case-insensitive whitelist check for resolver input validation. */
export function isKnownMake(make: string): boolean {
  const target = make.trim().toLowerCase();
  return MAKES.some((m) => m.toLowerCase() === target);
}
