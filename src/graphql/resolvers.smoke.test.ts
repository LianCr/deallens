/**
 * GraphQL gateway smoke tests — whitelist validation, DEMO tagging,
 * and invalid-input classification. Calls resolvers directly so Yoga's
 * production error masking does not hide extension codes.
 */
import { describe, expect, test } from "vitest";
import { GraphQLError } from "graphql";
import { resolvers } from "./resolvers";
import { createLoaders } from "./loaders";
import { executeGraphQL } from "./yoga";

const ctx = () => ({ loaders: createLoaders() });

describe("GraphQL gateway", () => {
  test("makes returns the curated whitelist (in-process yoga)", async () => {
    const data = await executeGraphQL<{ makes: string[] }>(`{ makes }`);
    expect(data.makes).toContain("Honda");
    expect(data.makes).toContain("Toyota");
    expect(data.makes.length).toBeGreaterThanOrEqual(20);
  });

  test("priceContext tags the synthetic market as DEMO", async () => {
    const data = await executeGraphQL<{
      priceContext: {
        dataSource: string;
        verdict: string;
        quote: number;
        samples: number[];
      };
    }>(
      `query ($make: String!, $model: String!, $year: Int!, $quote: Int!) {
        priceContext(make: $make, model: $model, year: $year, quote: $quote) {
          dataSource verdict quote samples
        }
      }`,
      { make: "Honda", model: "Civic", year: 2022, quote: 24500 },
    );
    expect(data.priceContext.dataSource).toBe("DEMO");
    expect(data.priceContext.quote).toBe(24500);
    expect(data.priceContext.samples.length).toBeGreaterThan(0);
    expect(["GREAT_DEAL", "FAIR", "ABOVE_MARKET", "INSUFFICIENT_DATA"]).toContain(
      data.priceContext.verdict,
    );
  });

  test("unknown make on models → INVALID_INPUT", async () => {
    try {
      await resolvers.Query.models(
        null,
        { make: "NotARealMakeXYZ", year: 2022 },
        ctx(),
      );
      expect.fail("expected INVALID_INPUT");
    } catch (error) {
      expect(error).toBeInstanceOf(GraphQLError);
      expect((error as GraphQLError).extensions?.code).toBe("INVALID_INPUT");
      expect((error as GraphQLError).message).toMatch(/unknown make/i);
    }
  });

  test("non-positive quote → INVALID_INPUT", async () => {
    try {
      await resolvers.Query.priceContext(null, {
        make: "Honda",
        model: "Civic",
        year: 2022,
        quote: 0,
      });
      expect.fail("expected INVALID_INPUT");
    } catch (error) {
      expect(error).toBeInstanceOf(GraphQLError);
      expect((error as GraphQLError).extensions?.code).toBe("INVALID_INPUT");
      expect((error as GraphQLError).message).toMatch(/positive/i);
    }
  });
});
