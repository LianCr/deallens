// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildHealthReport, integrationStatus, probeUpstreams, UPSTREAM_PROBES } from "./health";
import { UpstreamError } from "@/sources/errors";
import { GET } from "@/app/api/health/route";

describe("integrationStatus", () => {
  it("reports a keyless deployment honestly: DEMO listings, AI and voice off", () => {
    expect(integrationStatus({})).toEqual({
      anthropic: "off",
      listingSearch: "demo-fallback",
      openaiVoice: { transcribe: "off", speak: "off" },
      mongodb: "off",
    });
  });

  it("detects live keys without ever returning their values", () => {
    const env = {
      ANTHROPIC_API_KEY: "sk-ant-SECRET",
      SERPAPI_API_KEY: "serp-SECRET",
      STT_API_KEY: "sk-openai-SECRET",
      MONGODB_URI: "mongodb+srv://user:SECRET@host/db",
    };
    const status = integrationStatus(env);
    expect(status).toEqual({
      anthropic: "live",
      listingSearch: "live",
      openaiVoice: { transcribe: "live", speak: "live" },
      mongodb: "configured",
    });
    expect(JSON.stringify(buildHealthReport(env, undefined))).not.toContain("SECRET");
  });

  it("accepts LISTING_SEARCH_API_KEY as the search key too", () => {
    expect(integrationStatus({ LISTING_SEARCH_API_KEY: "k" }).listingSearch).toBe("live");
  });

  it("treats whitespace-only keys as unset", () => {
    expect(integrationStatus({ ANTHROPIC_API_KEY: "  " }).anthropic).toBe("off");
  });

  it("mock flags win, matching the routes and the listing collector", () => {
    const status = integrationStatus({
      MOCK_AI: "1",
      ANTHROPIC_API_KEY: "k",
      MOCK_LISTING_SEARCH: "1",
      SERPAPI_API_KEY: "k",
      MOCK_STT: "1",
      MOCK_TTS: "1",
    });
    expect(status.anthropic).toBe("mock");
    expect(status.listingSearch).toBe("mock");
    expect(status.openaiVoice).toEqual({ transcribe: "mock", speak: "mock" });
  });
});

describe("probeUpstreams", () => {
  it("marks each upstream ok/failed with its error kind", async () => {
    let t = 0;
    const results = await probeUpstreams(
      async (source) => {
        t += 40;
        if (source === "fueleconomy-gov") throw new UpstreamError("TIMEOUT", source, "slow");
      },
      () => t,
    );
    expect(results.map((r) => r.name)).toEqual(UPSTREAM_PROBES.map((p) => p.name));
    expect(results[0]).toMatchObject({ name: "nhtsa-vpic", ok: true });
    expect(results[1]).toMatchObject({ name: "fueleconomy-gov", ok: false, error: "TIMEOUT" });
  });

  it("classifies non-UpstreamError failures as UNKNOWN", async () => {
    const results = await probeUpstreams(async () => {
      throw new Error("boom");
    });
    expect(results.every((r) => !r.ok && r.error === "UNKNOWN")).toBe(true);
  });
});

describe("buildHealthReport", () => {
  const at = new Date("2026-11-17T00:00:00Z");

  it("is ok without probes and shortens the deployed commit", () => {
    const report = buildHealthReport({ VERCEL_GIT_COMMIT_SHA: "abcdef1234567" }, undefined, at);
    expect(report).toMatchObject({ status: "ok", version: "abcdef1", checkedAt: at.toISOString() });
    expect(report).not.toHaveProperty("upstreams");
  });

  it("is degraded when any probed upstream failed", () => {
    const report = buildHealthReport(
      {},
      [
        { name: "nhtsa-vpic", ok: true, latencyMs: 120 },
        { name: "fueleconomy-gov", ok: false, latencyMs: 3000, error: "TIMEOUT" },
      ],
      at,
    );
    expect(report.status).toBe("degraded");
    expect(report.version).toBe("dev");
  });
});

describe("GET /api/health", () => {
  it("shallow check: 200, no-store, no upstream calls", async () => {
    const res = await GET(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.integrations).toBeDefined();
    expect(body.upstreams).toBeUndefined();
  });
});
