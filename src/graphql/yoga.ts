import { createSchema, createYoga } from "graphql-yoga";
import { typeDefs } from "./schema";
import { resolvers, type GraphQLContext } from "./resolvers";
import { createLoaders } from "./loaders";

/**
 * One yoga instance serves two consumers:
 *  - the public HTTP endpoint at /api/graphql (with GraphiQL), and
 *  - server components, which execute operations in-process through
 *    executeGraphQL() below — same schema, same resolvers, no HTTP hop.
 * That symmetry is the isomorphic story: there is exactly one API.
 */
export const yoga = createYoga({
  schema: createSchema<GraphQLContext>({ typeDefs, resolvers }),
  context: (): GraphQLContext => ({ loaders: createLoaders() }),
  graphqlEndpoint: "/api/graphql",
  fetchAPI: { Response },
});

interface GraphQLResult<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

/**
 * In-process GraphQL execution for server components. Throws on any
 * GraphQL error — SSR either renders a real answer or falls back to the
 * page's own error handling; it never half-renders.
 */
export async function executeGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await yoga.fetch("http://internal/api/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const result = (await response.json()) as GraphQLResult<T>;
  if (result.errors?.length) {
    const [first] = result.errors;
    throw new Error(
      `GraphQL ${first?.extensions?.code ?? "ERROR"}: ${first?.message}`,
    );
  }
  if (result.data === undefined) {
    throw new Error("GraphQL returned no data");
  }
  return result.data;
}
