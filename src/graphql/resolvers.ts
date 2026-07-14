import { GraphQLError } from "graphql";
import { percentileValue } from "@/domain/percentile";
import { assessDeal } from "@/domain/verdict";
import { buildHistogram } from "@/domain/histogram";
import { UpstreamError } from "@/sources/errors";
import { decodeVin } from "@/sources/vpic";
import { fetchFuelEconomy } from "@/sources/fueleconomy";
import { generatePricingDataset } from "@/sources/pricing-gen";
import { MAKES, YEARS } from "./makes";
import type { Loaders } from "./loaders";

export interface GraphQLContext {
  loaders: Loaders;
}

/**
 * Error classification: upstream failures become GraphQL errors with a
 * machine-readable extension code, so clients can distinguish "the
 * government API timed out, retry" from "your input is bad, don't".
 */
function toGraphQLError(cause: unknown): GraphQLError {
  if (cause instanceof UpstreamError) {
    const code =
      cause.kind === "TIMEOUT"
        ? "UPSTREAM_TIMEOUT"
        : cause.kind === "FORMAT"
          ? "UPSTREAM_FORMAT_DRIFT"
          : "UPSTREAM_UNAVAILABLE";
    return new GraphQLError(cause.message, {
      extensions: { code, source: cause.source },
    });
  }
  if (cause instanceof GraphQLError) return cause;
  return new GraphQLError("Internal error", {
    extensions: { code: "INTERNAL" },
  });
}

function invalidInput(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: "INVALID_INPUT" } });
}

function requireVehicleArgs(make: string, model: string, year: number): void {
  if (!make.trim() || !model.trim()) {
    throw invalidInput("make and model must be non-empty");
  }
  if (!Number.isInteger(year) || year < 1980 || year > 2035) {
    throw invalidInput(`year ${year} is out of range`);
  }
}

/** ISO "YYYY-MM" anchor for the pricing generator's history window. */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const resolvers = {
  Query: {
    makes: (): readonly string[] => MAKES,

    years: (): readonly number[] => YEARS,

    models: async (
      _parent: unknown,
      args: { make: string; year: number },
      context: GraphQLContext,
    ): Promise<string[]> => {
      if (!args.make.trim()) throw invalidInput("make must be non-empty");
      if (!YEARS.includes(args.year)) {
        throw invalidInput(`year ${args.year} is outside the supported range`);
      }
      try {
        const models = await context.loaders.models.load(args);
        return models.map((m) => m.name);
      } catch (cause) {
        throw toGraphQLError(cause);
      }
    },

    decodeVin: async (_parent: unknown, args: { vin: string }) => {
      const vin = args.vin.trim();
      if (vin.length < 11 || vin.length > 17) {
        throw invalidInput("a VIN is 11–17 characters");
      }
      try {
        return await decodeVin(vin);
      } catch (cause) {
        throw toGraphQLError(cause);
      }
    },

    priceContext: (
      _parent: unknown,
      args: { make: string; model: string; year: number; quote: number },
    ) => {
      requireVehicleArgs(args.make, args.model, args.year);
      if (!Number.isInteger(args.quote) || args.quote <= 0) {
        throw invalidInput("quote must be a positive dollar amount");
      }
      const dataset = generatePricingDataset(
        args.make,
        args.model,
        args.year,
        currentMonthKey(),
      );
      const { verdict, percentile } = assessDeal(args.quote, dataset.listings);
      const sufficient = percentile !== null;
      return {
        quote: args.quote,
        verdict,
        percentile,
        p25: sufficient ? percentileValue(dataset.listings, 25) : null,
        median: sufficient ? percentileValue(dataset.listings, 50) : null,
        p75: sufficient ? percentileValue(dataset.listings, 75) : null,
        distribution: buildHistogram(dataset.listings),
        history: dataset.history,
        events: dataset.events,
        dataSource: dataset.dataSource,
      };
    },

    fuelEconomy: async (
      _parent: unknown,
      args: { make: string; model: string; year: number },
    ) => {
      requireVehicleArgs(args.make, args.model, args.year);
      try {
        const record = await fetchFuelEconomy(args.year, args.make, args.model);
        if (record === null) return null;
        return { ...record, dataSource: "REAL" as const };
      } catch (cause) {
        throw toGraphQLError(cause);
      }
    },
  },
};
