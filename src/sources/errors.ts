/**
 * Upstream failures, classified. The GraphQL layer maps these onto
 * error extensions so a timeout, an empty result, and a bad input are
 * never confused with each other.
 */
export type UpstreamErrorKind = "TIMEOUT" | "HTTP" | "FORMAT";

export class UpstreamError extends Error {
  readonly kind: UpstreamErrorKind;
  readonly source: string;

  constructor(kind: UpstreamErrorKind, source: string, message: string) {
    super(`[${source}] ${message}`);
    this.name = "UpstreamError";
    this.kind = kind;
    this.source = source;
  }
}

/** Query parameters whose values must never appear in an error message. */
const SECRET_PARAMS = /^(api_?key|key|token|access_token|secret|password)$/i;

/**
 * Strip credential values from a URL before it goes into an error
 * message. Error messages travel: into API responses, logs and Sentry-
 * style tools. SerpAPI takes its key as `?api_key=`, so without this a
 * 401/429 from SerpAPI echoed the key back to the browser.
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const name of [...parsed.searchParams.keys()]) {
      if (SECRET_PARAMS.test(name)) parsed.searchParams.set(name, "REDACTED");
    }
    return parsed.toString();
  } catch {
    return "[unparseable url]";
  }
}

/** Default per-request timeout for upstream government APIs. */
export const UPSTREAM_TIMEOUT_MS = 8_000;

/**
 * fetch wrapper with a hard timeout and error classification.
 * Never throws a raw fetch error — everything becomes an UpstreamError.
 */
export async function fetchUpstream(
  source: string,
  url: string,
  init: RequestInit = {},
  timeoutMs = UPSTREAM_TIMEOUT_MS,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "TimeoutError") {
      throw new UpstreamError("TIMEOUT", source, `timed out after ${timeoutMs}ms: ${redactUrl(url)}`);
    }
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw cause; // caller-initiated aborts (e.g. stale cascade requests) pass through
    }
    throw new UpstreamError("HTTP", source, `network failure: ${String(cause)}`);
  }
  if (!response.ok) {
    throw new UpstreamError("HTTP", source, `HTTP ${response.status} from ${redactUrl(url)}`);
  }
  return response;
}
