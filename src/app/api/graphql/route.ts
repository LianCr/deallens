import { yoga } from "@/graphql/yoga";

/**
 * Public GraphQL endpoint (GraphiQL included — open /api/graphql in a
 * browser to explore the schema). Node runtime: the gateway does
 * fan-out fetches and in-memory caching that belong on the server.
 */
export const runtime = "nodejs";

const handleRequest = (request: Request): Promise<Response> =>
  Promise.resolve(yoga.handleRequest(request, {}));

export { handleRequest as GET, handleRequest as POST, handleRequest as OPTIONS };
