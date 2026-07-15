import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

/**
 * The transcribe route in its CI-safe modes: availability probe,
 * validation, mock transcription, and the honest no-key answer. The
 * live upstream call is exercised only by manual smoke tests, like the
 * other AI routes.
 */

const audioRequest = (body: BodyInit | null, headers: Record<string, string>) =>
  new Request("http://localhost/api/transcribe", { method: "POST", body, headers });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/api/transcribe", () => {
  it("GET reports disabled without a key, enabled with one (or in mock mode)", async () => {
    expect((await GET().json()).enabled).toBe(false);

    vi.stubEnv("STT_API_KEY", "sk-test");
    expect((await GET().json()).enabled).toBe(true);
    vi.unstubAllEnvs();

    vi.stubEnv("MOCK_STT", "1");
    expect((await GET().json()).enabled).toBe(true);
  });

  it("rejects non-audio bodies before touching the guard or the key", async () => {
    const response = await POST(
      audioRequest(JSON.stringify({}), { "content-type": "application/json" }),
    );
    expect(response.status).toBe(400);
  });

  it("returns the deterministic transcript in mock mode", async () => {
    vi.stubEnv("MOCK_STT", "1");
    const response = await POST(
      audioRequest(new Blob(["audio"]), { "content-type": "audio/webm" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-deallens-ai")).toBe("mock");
    expect((await response.json()).text).toContain("Mock transcription");
  });

  it("answers 503 no-key honestly when no speech model is configured", async () => {
    const response = await POST(
      audioRequest(new Blob(["audio"]), { "content-type": "audio/webm" }),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).reason).toBe("no-key");
  });

  it("caps the recording size", async () => {
    vi.stubEnv("STT_API_KEY", "sk-test");
    const oversized = new Uint8Array(1_000_001);
    const response = await POST(
      audioRequest(oversized, { "content-type": "audio/webm" }),
    );
    expect(response.status).toBe(413);
  });
});
