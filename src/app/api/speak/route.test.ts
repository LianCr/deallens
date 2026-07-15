import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { MAX_SPEAK_CHARS, speakableText } from "./speakable";

/**
 * The speak route in its CI-safe modes — availability probe,
 * validation, mock audio, honest no-key — plus the pure text cleaner.
 * The live upstream call is exercised only by manual smoke tests.
 */

const speakRequest = (body: unknown) =>
  new Request("http://localhost/api/speak", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("speakableText", () => {
  it("strips the brief's markdown so bold isn't read as 'asterisk asterisk'", () => {
    expect(speakableText("**What the numbers say**\nThis is a `great` *deal*.")).toBe(
      "What the numbers say\nThis is a great deal.",
    );
    expect(speakableText("## Heading\n\n\n\nbody   text")).toBe("Heading\n\nbody text");
  });
});

describe("/api/speak", () => {
  it("GET reports disabled without a key, enabled with one (or in mock mode)", async () => {
    expect((await GET().json()).enabled).toBe(false);

    vi.stubEnv("STT_API_KEY", "sk-test");
    expect((await GET().json()).enabled).toBe(true);
    vi.unstubAllEnvs();

    vi.stubEnv("MOCK_TTS", "1");
    expect((await GET().json()).enabled).toBe(true);
  });

  it("rejects empty and oversize text before touching the guard", async () => {
    expect((await POST(speakRequest({ text: "" }))).status).toBe(400);
    expect((await POST(speakRequest({}))).status).toBe(400);
    expect(
      (await POST(speakRequest({ text: "x".repeat(MAX_SPEAK_CHARS + 1) }))).status,
    ).toBe(413);
  });

  it("returns a playable WAV in mock mode", async () => {
    vi.stubEnv("MOCK_TTS", "1");
    const response = await POST(speakRequest({ text: "This quote is a great deal." }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/wav");
    expect(response.headers.get("x-deallens-ai")).toBe("mock");
    const bytes = new Uint8Array(await response.arrayBuffer());
    // Valid RIFF/WAVE header — a real <audio> element can play this.
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe("WAVE");
    expect(bytes.length).toBeGreaterThan(44);
  });

  it("answers 503 no-key honestly when no speech model is configured", async () => {
    const response = await POST(speakRequest({ text: "hello" }));
    expect(response.status).toBe(503);
    expect((await response.json()).reason).toBe("no-key");
  });

  it("maps an out-of-credit upstream to no-quota, not a generic failure", async () => {
    vi.stubEnv("STT_API_KEY", "sk-test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 })),
    );
    try {
      const response = await POST(speakRequest({ text: "hello there" }));
      expect(response.status).toBe(502);
      expect((await response.json()).reason).toBe("no-quota");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
