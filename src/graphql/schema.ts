/**
 * The gateway schema: three heterogeneous upstreams (NHTSA vPIC,
 * fueleconomy.gov, the synthetic pricing generator) aggregated into one
 * clean graph. Design notes live in the README; the two ideas worth
 * calling out here:
 *
 *  - Data honesty is part of the type system. Everything priced carries
 *    a `DataSourceTag` (REAL | DEMO), and `percentile` is nullable
 *    because "not enough data" is an answer we insist on being able to
 *    express, not an error to paper over.
 *  - Errors are classified, not stringly-typed: upstream timeouts, bad
 *    input, and format drift map to distinct extension codes (see
 *    resolvers.ts).
 */
export const typeDefs = /* GraphQL */ `
  type Query {
    """Curated list of common makes (a whitelist — vPIC's full make table contains thousands of junk registrations)."""
    makes: [String!]!

    """Model years the picker offers, newest first."""
    years: [Int!]!

    """Consumer models (cars, MPVs, trucks — no motorcycles) for a make + year. Empty list means vPIC has no models there; that's an answer, not an error."""
    models(make: String!, year: Int!): [String!]!

    """Decode a VIN to a vehicle. Null when the VIN doesn't identify one."""
    decodeVin(vin: String!): DecodedVehicle

    """Where a dealer quote lands in the market for a vehicle."""
    priceContext(make: String!, model: String!, year: Int!, quote: Int!): PriceContext!

    """Real EPA fuel economy, or null when fueleconomy.gov has no confident match — we don't force pairings."""
    fuelEconomy(make: String!, model: String!, year: Int!): FuelEconomy
  }

  type DecodedVehicle {
    make: String!
    model: String!
    year: Int!
    "Non-fatal decoder complaints, e.g. a failed check digit."
    warning: String
  }

  enum Verdict {
    GREAT_DEAL
    FAIR
    ABOVE_MARKET
    INSUFFICIENT_DATA
  }

  "Data honesty, encoded: REAL comes from a public API, DEMO from the labeled synthetic dataset."
  enum DataSourceTag {
    REAL
    DEMO
  }

  type PriceContext {
    quote: Int!
    verdict: Verdict!
    "Null when the sample is too small to be honest about."
    percentile: Float
    "Market quartiles; null under the same insufficient-data rule."
    p25: Float
    median: Float
    p75: Float
    distribution: [PriceBucket!]!
    history: [PricePoint!]!
    events: [MarketEvent!]!
    dataSource: DataSourceTag!
  }

  type PriceBucket {
    lo: Float!
    hi: Float!
    count: Int!
  }

  type PricePoint {
    "ISO YYYY-MM month key."
    month: String!
    price: Int!
  }

  enum MarketEventKind {
    MODEL_YEAR
    SEASONAL
    INCENTIVE
  }

  type MarketEvent {
    month: String!
    title: String!
    kind: MarketEventKind!
  }

  type FuelEconomy {
    combinedMpg: Int!
    "The fueleconomy.gov model variant the MPG belongs to."
    feModelName: String!
    fuelType: String!
    dataSource: DataSourceTag!
  }
`;
