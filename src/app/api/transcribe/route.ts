import { getAiGuard } from "@/ai/guard";

/**
 * Tier-2 dictation: transcribe one recorded utterance with a real
 * speech model. Strictly optional — without `STT_API_KEY` the endpoint
 * reports itself disabled and every mic falls back to the browser's own
 * Web Speech tier, so clone-and-run stays keyless (Anthropic has no STT
 * API; this is the second-vendor exception ADR 006 planned for, behind
 * the same bring-your-own-key pattern as the LLM routes).
 *
 * Privacy contract: the audio is forwarded to the configured speech
 * service and never written anywhere; only the text comes back.
 *
 * GET  → { enabled } — lets clients pick a tier without a failed upload.
 * POST → { text }    — body is the raw audio blob (webm/opus or mp4).
 */
export const runtime = "nodejs";

/** Matches MAX_RECORDING_BYTES client-side; ~25s of opus. */
const MAX_BYTES = 1_000_000;

const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";
/** Whisper-family model; env-tunable, one place. */
const DEFAULT_MODEL = "gpt-4o-mini-transcribe";

const MOCK_TRANSCRIPT = "Mock transcription: reliable family SUV under thirty thousand.";

const clientIp = (request: Request): string =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

const jsonError = (status: number, reason: string, message: string): Response =>
  Response.json({ reason, message }, { status });

const enabled = (): boolean =>
  process.env.MOCK_STT === "1" || Boolean(process.env.STT_API_KEY);

export function GET(): Response {
  return Response.json({ enabled: enabled() });
}

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("audio/")) {
    return jsonError(400, "bad-request", "Send the recorded audio as the request body.");
  }

  // One budget for all AI surfaces — a transcription costs real money too.
  const verdict = getAiGuard().check(clientIp(request));
  if (!verdict.ok) return jsonError(429, verdict.reason, verdict.message);

  if (process.env.MOCK_STT === "1") {
    return Response.json({ text: MOCK_TRANSCRIPT }, { headers: { "x-deallens-ai": "mock" } });
  }

  const key = process.env.STT_API_KEY;
  if (!key) {
    return jsonError(
      503,
      "no-key",
      "No speech model is configured on this deployment — the browser tier still works.",
    );
  }

  const audio = await request.arrayBuffer();
  if (audio.byteLength === 0) {
    return jsonError(400, "bad-request", "The recording arrived empty.");
  }
  if (audio.byteLength > MAX_BYTES) {
    return jsonError(413, "too-large", "Recordings are capped at ~25 seconds.");
  }

  const langHint = request.headers.get("x-stt-lang") ?? "";
  const extension = contentType.includes("mp4") ? "mp4" : "webm";
  const form = new FormData();
  form.append("file", new File([audio], `dictation.${extension}`, { type: contentType }));
  form.append("model", process.env.STT_MODEL ?? DEFAULT_MODEL);
  // Whisper-family models auto-detect language; a hint only narrows it.
  if (/^[a-z]{2}(-[A-Za-z]{2})?$/.test(langHint)) {
    form.append("language", langHint.slice(0, 2));
  }

  try {
    const upstream = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    if (upstream.status === 401 || upstream.status === 403) {
      // A configured-but-rejected key is a deployment problem, not an
      // audio problem — say so instead of blaming the recording.
      return jsonError(502, "bad-key", "The configured speech key was rejected by the speech service.");
    }
    if (upstream.status === 429) {
      // Out of credit / rate limited upstream — again not the shopper's
      // fault, and the mic falls back to the browser tier.
      return jsonError(502, "no-quota", "The speech account is out of credit — dictation falls back to your browser.");
    }
    if (!upstream.ok) {
      // Surface the upstream classification (never the key, never the
      // audio) so a quota or model-access problem is diagnosable from
      // the response instead of reading as a bad recording.
      const detail = await upstream
        .json()
        .then((body: { error?: { message?: string } }) =>
          (body.error?.message ?? "").slice(0, 160),
        )
        .catch(() => "");
      return Response.json(
        {
          reason: "upstream",
          message: "The speech service couldn't transcribe that — try again or type.",
          detail: `speech service answered ${upstream.status}${detail ? `: ${detail}` : ""}`,
        },
        { status: 502 },
      );
    }
    const data = (await upstream.json()) as { text?: string };
    return Response.json(
      { text: (data.text ?? "").trim() },
      { headers: { "x-deallens-ai": "live" } },
    );
  } catch {
    return jsonError(502, "upstream", "The speech service timed out — try again or type.");
  }
}
