import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchUpstream, redactUrl, UpstreamError } from "./errors";

const SERP_URL =
  "https://serpapi.com/search.json?engine=google&q=used+2022+Honda+Civic&api_key=sk_live_SECRET123&num=20";

describe("redactUrl", () => {
  it("replaces credential query values and keeps everything else", () => {
    const out = redactUrl(SERP_URL);
    expect(out).not.toContain("SECRET123");
    expect(out).toContain("api_key=REDACTED");
    expect(out).toContain("q=used+2022+Honda+Civic");
    expect(out).toContain("num=20");
  });

  it.each(["key", "apiKey", "token", "access_token", "secret", "password"])(
    "redacts %s",
    (name) => {
      expect(redactUrl(`https://x.test/a?${name}=hunter2`)).toBe(
        `https://x.test/a?${name}=REDACTED`,
      );
    },
  );

  it("leaves keyless government API URLs untouched", () => {
    const vpic = "https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/honda/modelyear/2022?format=json";
    expect(redactUrl(vpic)).toBe(vpic);
  });

  it("never throws on garbage input", () => {
    expect(redactUrl("not a url")).toBe("[unparseable url]");
  });
});

describe("fetchUpstream error messages", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not leak the SerpAPI key when SerpAPI answers 401/429", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    const err = await fetchUpstream("serpapi", SERP_URL).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).kind).toBe("HTTP");
    expect((err as Error).message).toContain("HTTP 429");
    expect((err as Error).message).not.toContain("SECRET123");
  });

  it("does not leak the key on timeout either", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("timed out", "TimeoutError");
      }),
    );
    const err = await fetchUpstream("serpapi", SERP_URL).catch((e: unknown) => e);
    expect((err as UpstreamError).kind).toBe("TIMEOUT");
    expect((err as Error).message).not.toContain("SECRET123");
  });
});
