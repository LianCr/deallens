/**
 * Captured-shaped SerpAPI organic results for contract tests and
 * MOCK_LISTING_SEARCH=1. Prices/links are illustrative of real search
 * result shape (title, link, snippet) — not live marketplace scrapes.
 */

import type { RawListingHit } from "@/research/collectors/listingCollector";

export function serpListingFixture(
  make: string,
  model: string,
  year: number,
  retrievedAt: string,
): RawListingHit[] {
  const base = Math.round(22_000 + (year - 2018) * 800);
  const rows: Array<{ title: string; link: string; snippet: string; source: string }> = [
    {
      title: `${year} ${make} ${model} LX — $${(base - 1200).toLocaleString("en-US")} | 42,100 miles`,
      link: `https://www.cars.com/vehicledetail/demo-${year}-${make}-${model}-1/`,
      snippet: `Used ${year} ${make} ${model} with 42,100 miles listed at $${(base - 1200).toLocaleString("en-US")} near Austin, TX.`,
      source: "cars.com",
    },
    {
      title: `${year} ${make} ${model} EX — $${base.toLocaleString("en-US")} · 38,500 mi`,
      link: `https://www.autotrader.com/cars-for-sale/vehicledetails.xhtml?listingId=demo-2`,
      snippet: `$${base.toLocaleString("en-US")} · 38,500 miles · Clean title · Dealer in Dallas, TX.`,
      source: "autotrader.com",
    },
    {
      title: `Certified ${year} ${make} ${model} — $${(base + 1800).toLocaleString("en-US")} (51k miles)`,
      link: `https://www.carvana.com/vehicle/demo-3`,
      snippet: `CPO ${year} ${make} ${model}, 51,000 miles, asking $${(base + 1800).toLocaleString("en-US")}.`,
      source: "carvana.com",
    },
    {
      title: `${year} ${make} ${model} Sport $${(base - 400).toLocaleString("en-US")} - 45,200 miles`,
      link: `https://www.cargurus.com/Cars/l-Used-${make}-${model}-demo-4`,
      snippet: `Price $${(base - 400).toLocaleString("en-US")}, 45,200 miles, Houston area.`,
      source: "cargurus.com",
    },
    {
      title: `${year - 1} ${make} ${model} — wrong year sample $${(base - 3000).toLocaleString("en-US")}`,
      link: `https://www.cars.com/vehicledetail/demo-wrong-year/`,
      snippet: `${year - 1} model year, 60,000 miles, $${(base - 3000).toLocaleString("en-US")}.`,
      source: "cars.com",
    },
    {
      title: `${year} ${make} ${model} — $${(base + 600).toLocaleString("en-US")} · 120,000 miles high mileage`,
      link: `https://www.autotrader.com/cars-for-sale/vehicledetails.xhtml?listingId=demo-hi-mi`,
      snippet: `High mileage 120,000 mi at $${(base + 600).toLocaleString("en-US")}.`,
      source: "autotrader.com",
    },
    {
      title: `${year} ${make} ${model} SE $${(base - 800).toLocaleString("en-US")} 33,000 miles Phoenix`,
      link: `https://www.cars.com/vehicledetail/demo-5/`,
      snippet: `$${base - 800} with 33,000 miles in Phoenix, AZ.`,
      source: "cars.com",
    },
    {
      title: `${year} ${make} ${model} $${(base + 200).toLocaleString("en-US")} — 40,800 miles`,
      link: `https://www.edmunds.com/inventory/demo-6.html`,
      snippet: `Asking $${(base + 200).toLocaleString("en-US")}, 40,800 miles.`,
      source: "edmunds.com",
    },
    {
      title: `${year} ${make} ${model} Touring $${(base + 2400).toLocaleString("en-US")} 29k mi`,
      link: `https://www.carmax.com/car/demo-7`,
      snippet: `$${base + 2400} · 29,000 miles · Touring trim.`,
      source: "carmax.com",
    },
    {
      title: `Duplicate mirror ${year} ${make} ${model} $${base.toLocaleString("en-US")} · 38,500 mi`,
      link: `https://www.autotrader.com/cars-for-sale/vehicledetails.xhtml?listingId=demo-2`,
      snippet: `Same listing URL as EX above — should dedupe.`,
      source: "autotrader.com",
    },
    {
      title: `${year} ${make} ${model} $${(base - 200).toLocaleString("en-US")} 44,100 miles`,
      link: `https://www.cars.com/vehicledetail/demo-8/`,
      snippet: `$${base - 200}, 44,100 miles, no trim in title.`,
      source: "cars.com",
    },
    {
      title: `${year} ${make} ${model} $${(base + 900).toLocaleString("en-US")} · 36,700 miles`,
      link: `https://www.cargurus.com/Cars/l-Used-demo-9`,
      snippet: `Listed at $${(base + 900).toLocaleString("en-US")} with 36,700 miles.`,
      source: "cargurus.com",
    },
    {
      title: `${year} ${make} ${model} — call for price`,
      link: `https://www.dealer.example/no-price`,
      snippet: `Inventory page without a clear asking price.`,
      source: "dealer.example",
    },
    {
      title: `${year} ${make} ${model} LX $${(base - 1500).toLocaleString("en-US")} 55,000 miles`,
      link: `https://www.cars.com/vehicledetail/demo-10/`,
      snippet: `$${base - 1500} · 55,000 miles · LX.`,
      source: "cars.com",
    },
  ];

  return rows.map((r) => {
    const blob = `${r.title} ${r.snippet}`;
    const priceMatch = blob.match(/\$\s*([\d,]+)/);
    const priceRaw = priceMatch?.[1];
    const price = priceRaw ? Number(priceRaw.replace(/,/g, "")) : undefined;
    const miMatch = blob.match(/([\d,]+)\s*(?:miles|mi)\b/i);
    const miRaw = miMatch?.[1];
    const mileage = miRaw ? Number(miRaw.replace(/,/g, "")) : undefined;
    const yearMatch = blob.match(/\b(20[0-2]\d)\b/);
    return {
      title: r.title,
      link: r.link,
      snippet: r.snippet,
      sourceName: r.source,
      retrievedAt,
      price: price != null && Number.isFinite(price) ? price : undefined,
      year: yearMatch?.[1] ? Number(yearMatch[1]) : year,
      make,
      model,
      mileage: mileage != null && Number.isFinite(mileage) ? mileage : undefined,
    };
  });
}
