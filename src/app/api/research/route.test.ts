// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/research/aiReport", () => ({
  generateResearchReport: vi.fn(),
}));

import { generateResearchReport } from "@/research/aiReport";
import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const CIVIC = { make: "Honda", model: "Civic", year: 2022, price: 24500, mileage: 42000 };

describe("POST /api/research", () => {
  beforeEach(() => {
    vi.stubEnv("MOCK_LISTING_SEARCH", "1");
    vi.stubEnv("MONGODB_URI", "");
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("keeps the deterministic result when the AI report throws", async () => {
    vi.mocked(generateResearchReport).mockRejectedValueOnce(new Error("529 overloaded"));
    const res = await post(CIVIC);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ai).toBeNull();
    expect(body.bundle.comparables.included.length).toBeGreaterThan(0);
    expect(["GREAT_DEAL", "FAIR", "ABOVE_MARKET", "INSUFFICIENT_DATA"]).toContain(body.bundle.verdict);
    const warned = vi.mocked(console.warn).mock.calls.map((c) => JSON.parse(c[0] as string));
    expect(warned).toContainEqual(expect.objectContaining({ event: "research.ai_report_failed", error: "Error" }));
  });

  it("logs a structured completion event", async () => {
    vi.mocked(generateResearchReport).mockResolvedValueOnce(null);
    await post(CIVIC);
    const lines = vi.mocked(console.info).mock.calls.map((c) => JSON.parse(c[0] as string));
    expect(lines).toContainEqual(
      expect.objectContaining({
        event: "research.completed",
        route: "/api/research",
        collectorMode: "LIVE_SEARCH",
        durationMs: expect.any(Number),
      }),
    );
  });

  it("400s on invalid input with a machine-readable reason", async () => {
    const res = await post({ make: "Honda" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ reason: "invalid_input" });
  });
});
