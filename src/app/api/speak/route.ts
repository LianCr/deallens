import { getAiGuard } from "@/ai/guard";
import { MAX_SPEAK_CHARS, speakableText } from "./speakable";

/**
 * Voice replies: synthesize one AI answer into speech with a real TTS
 * model. The mirror image of /api/transcribe — same optional OpenAI
 * key (`STT_API_KEY` powers dictation in AND voice out), same shared
 * rate guard, same honest degradation: without the key the endpoint
 * reports itself disabled and the speaker UI never renders.
 *
 * Privacy contract: the text is forwarded to the speech service and
 * the audio streams straight back to the caller — nothing is stored.
 *
 * GET  → { enabled } — lets clients decide whether to show voice UI.
 * POST → audio bytes (mp3 live / wav in mock mode), streamed through.
 */
export const runtime = "nodejs";

const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";
/** TTS model; env-tunable, one place. */
const DEFAULT_MODEL = "gpt-4o-mini-tts";

/**
 * Two delivery styles, two voices. The coach reads deal answers like a
 * knowledgeable friend; the storyteller delivers fun facts like a
 * secret worth leaning in for — the voice itself is the surprise.
 */
const VOICE_STYLES = {
  coach: {
    voice: () => process.env.TTS_VOICE ?? "nova",
    instructions:
      "Warm, natural, and conversational — a knowledgeable friend talking a shopper through a car deal. Speak dollar figures naturally (say twenty-four thousand five hundred dollars). Keep an easy, unhurried pace.",
  },
  storyteller: {
    voice: () => process.env.TTS_VOICE_STORYTELLER ?? "fable",
    instructions:
      "A delighted storyteller sharing a little-known secret — playful, theatrical, a hint of wonder. Lean into the reveal, pause before the punchline, and let the fun land. Never rushed, never salesy.",
  },
} as const;

type VoiceStyle = keyof typeof VOICE_STYLES;

const isVoiceStyle = (value: unknown): value is VoiceStyle =>
  value === "coach" || value === "storyteller";

const clientIp = (request: Request): string =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

const jsonError = (status: number, reason: string, message: string): Response =>
  Response.json({ reason, message }, { status });

const enabled = (): boolean =>
  process.env.MOCK_TTS === "1" || Boolean(process.env.STT_API_KEY);

/** A deterministic, valid 0.1s silent WAV for mock mode — CI plays this. */
function silentWav(): ArrayBuffer {
  const sampleRate = 8_000;
  const samples = 800;
  const dataSize = samples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);
  return buffer;
}

export function GET(): Response {
  return Response.json({ enabled: enabled() });
}

export async function POST(request: Request): Promise<Response> {
  let text: string;
  let style: VoiceStyle = "coach";
  try {
    const body = (await request.json()) as { text?: unknown; style?: unknown };
    text = typeof body.text === "string" ? speakableText(body.text) : "";
    if (isVoiceStyle(body.style)) style = body.style;
  } catch {
    text = "";
  }
  if (text.length === 0) {
    return jsonError(400, "bad-request", "Send { text } — the reply to voice.");
  }
  if (text.length > MAX_SPEAK_CHARS) {
    return jsonError(413, "too-large", "That reply is too long to voice.");
  }

  // One budget for all AI surfaces — synthesis costs real money too.
  const verdict = getAiGuard().check(clientIp(request));
  if (!verdict.ok) return jsonError(429, verdict.reason, verdict.message);

  if (process.env.MOCK_TTS === "1") {
    return new Response(silentWav(), {
      headers: { "content-type": "audio/wav", "x-deallens-ai": "mock" },
    });
  }

  const key = process.env.STT_API_KEY;
  if (!key) {
    return jsonError(
      503,
      "no-key",
      "No speech model is configured on this deployment — the text reply is the answer.",
    );
  }

  try {
    const upstream = await fetch(OPENAI_SPEECH_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.TTS_MODEL ?? DEFAULT_MODEL,
        voice: VOICE_STYLES[style].voice(),
        input: text,
        response_format: "mp3",
        instructions: VOICE_STYLES[style].instructions,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (upstream.status === 401 || upstream.status === 403) {
      return jsonError(502, "bad-key", "The configured speech key was rejected by the speech service.");
    }
    if (upstream.status === 429) {
      return jsonError(502, "no-quota", "The speech account is out of credit — the text reply is the answer.");
    }
    if (!upstream.ok || !upstream.body) {
      const detail = await upstream
        .json()
        .then((body: { error?: { message?: string } }) =>
          (body.error?.message ?? "").slice(0, 160),
        )
        .catch(() => "");
      return Response.json(
        {
          reason: "upstream",
          message: "The speech service couldn't voice that reply.",
          detail: `speech service answered ${upstream.status}${detail ? `: ${detail}` : ""}`,
        },
        { status: 502 },
      );
    }
    // Stream the audio straight through; nothing is buffered or stored.
    return new Response(upstream.body, {
      headers: { "content-type": "audio/mpeg", "x-deallens-ai": "live" },
    });
  } catch {
    return jsonError(502, "upstream", "The speech service timed out.");
  }
}
