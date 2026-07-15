import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

/**
 * The fun-fact route in its CI-safe modes: validation, guard, mock
 * output, honest no-key. The live path (search + generation + cache) is
 * exercised by manual smoke tests, like the other AI routes.
 */

const factRequest = (body: unknown) =>
  new Request("http://localhost/api/fun-fact", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/api/fun-fact", () => {
  it("accepts identifiers only, with the deal page's bounds", async () => {
    expect((await POST(factRequest({}))).status).toBe(400);
    expect(
      (await POST(factRequest({ make: "honda", year: 1900, model: "civic" }))).status,
    ).toBe(400);
    expect(
      (await POST(factRequest({ make: "", year: 2022, model: "civic" }))).status,
    ).toBe(400);
  });

  it("returns the deterministic story in mock mode", async () => {
    vi.stubEnv("MOCK_AI", "1");
    const response = await POST(
      factRequest({ make: "honda", year: 2022, model: "civic" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-deallens-ai")).toBe("mock");
    expect(await response.text()).toContain("Mock fun fact");
  });

  it("answers 503 no-key honestly", async () => {
    const response = await POST(
      factRequest({ make: "honda", year: 2022, model: "civic" }),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).reason).toBe("no-key");
  });
});
