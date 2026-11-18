// @vitest-environment node
import { buildSchema, printSchema } from "graphql";
import { expect, it } from "vitest";
import { typeDefs } from "./schema";

/**
 * docs/schema.graphql is the published contract linked from the README.
 * This test fails when src/graphql/schema.ts changes and the doc does
 * not; refresh it with `npx vitest run src/graphql -u`.
 */
it("docs/schema.graphql matches the served schema", async () => {
  const sdl = printSchema(buildSchema(typeDefs));
  await expect(`# Generated from src/graphql/schema.ts — do not edit by hand.\n# Refresh: npx vitest run src/graphql -u\n\n${sdl}\n`).toMatchFileSnapshot(
    "../../docs/schema.graphql",
  );
});
