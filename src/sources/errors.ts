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
      throw new UpstreamError("TIMEOUT", source, `timed out after ${timeoutMs}ms: ${url}`);
    }
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw cause; // caller-initiated aborts (e.g. stale cascade requests) pass through
    }
    throw new UpstreamError("HTTP", source, `network failure: ${String(cause)}`);
  }
  if (!response.ok) {
    throw new UpstreamError("HTTP", source, `HTTP ${response.status} from ${url}`);
  }
  return response;
}
