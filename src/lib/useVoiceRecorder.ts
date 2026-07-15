"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Tier-2 dictation: record with MediaRecorder, then transcribe the
 * whole utterance through `/api/transcribe` (a real speech model behind
 * an optional server key). This is the ChatGPT dictation shape — record
 * with level feedback, release, get one accurate transcript — rather
 * than live streaming, which the Web Speech tier already covers.
 *
 * Every browser dependency (getUserMedia, MediaRecorder, the level
 * meter, the upload) is injectable — the same seam pattern as
 * useSpeechInput — so unit tests drive the full state machine without a
 * microphone. See docs/adr/006-voice-input.md.
 */

/** Longest recording we accept; the server enforces the byte cap. */
export const MAX_RECORDING_MS = 25_000;
export const MAX_RECORDING_BYTES = 1_000_000;

/** The slice of MediaRecorder this hook drives (and fakes implement). */
export interface MediaRecorderLike {
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  start(): void;
  stop(): void;
}

export interface MediaStreamLike {
  getTracks(): Array<{ stop(): void }>;
}

/** A running audio-level meter; read() returns 0..1, close() releases. */
export interface LevelMeterLike {
  read(): number;
  close(): void;
}

export interface VoiceRecorderDeps {
  getUserMedia(): Promise<MediaStreamLike>;
  createRecorder(stream: MediaStreamLike): { recorder: MediaRecorderLike; mimeType: string };
  /** null = no level metering (tests, exotic browsers); UI shows a pulse instead. */
  createLevelMeter(stream: MediaStreamLike): LevelMeterLike | null;
  transcribe(blob: Blob, lang: string): Promise<string>;
}

export type VoiceRecorderErrorKind =
  | "permission-denied"
  | "too-long"
  | "transcribe-failed";

export type VoiceRecorderState =
  | { status: "unsupported" }
  | { status: "idle" }
  | { status: "recording" }
  | { status: "transcribing" }
  | { status: "error"; kind: VoiceRecorderErrorKind };

export interface UseVoiceRecorderOptions {
  /** The finished transcript; the host keeps it editable, never auto-submits. */
  onFinal: (text: string) => void;
  /** Audio level while recording, 0..1 — drive visuals via refs only. */
  onLevel?: (level: number) => void;
  /** BCP 47 hint forwarded to the speech model. */
  lang: string;
  /**
   * Test seam: inject fakes, or `null` to force the unsupported path.
   * `undefined` (default) uses the real browser APIs.
   */
  deps?: VoiceRecorderDeps | null;
}

export interface VoiceRecorder {
  state: VoiceRecorderState;
  start: () => void;
  /** Stop recording and transcribe what was captured. */
  stop: () => void;
  /** Discard the recording; nothing is uploaded. */
  cancel: () => void;
}

/** Recording upload support = getUserMedia + MediaRecorder. */
export function detectRecorderSupport(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder === "function" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

const subscribeNever = () => () => {};
export function useRecorderSupported(): boolean {
  return useSyncExternalStore(subscribeNever, detectRecorderSupport, () => false);
}

/** Preference order: Chrome/Firefox speak webm+opus, Safari records mp4. */
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

export class TranscribeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscribeError";
  }
}

function buildLevelMeter(stream: MediaStreamLike): LevelMeterLike | null {
  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  const context = new AudioContextCtor();
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  context.createMediaStreamSource(stream as unknown as MediaStream).connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);
  return {
    read() {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const deviation = (sample - 128) / 128;
        sum += deviation * deviation;
      }
      // RMS, scaled so normal speech spans most of the range.
      return Math.min(1, Math.sqrt(sum / samples.length) * 4);
    },
    close() {
      void context.close();
    },
  };
}

function realDeps(): VoiceRecorderDeps {
  return {
    getUserMedia: () => navigator.mediaDevices.getUserMedia({ audio: true }),
    createRecorder(stream) {
      const mimeType =
        MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
      const recorder = new MediaRecorder(
        stream as unknown as MediaStream,
        mimeType ? { mimeType } : undefined,
      );
      // DOM lib types the handler as (ev: BlobEvent) => any; our Like
      // slice only reads .data, so the assignment is safe in practice.
      return {
        recorder: recorder as unknown as MediaRecorderLike,
        mimeType: recorder.mimeType || mimeType || "audio/webm",
      };
    },
    createLevelMeter(stream) {
      // Metering is a visual nicety — any failure (no AudioContext, a
      // stream the context rejects) degrades to the pulse, silently.
      try {
        return buildLevelMeter(stream);
      } catch {
        return null;
      }
    },
    async transcribe(blob, lang) {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: {
          "content-type": blob.type || "application/octet-stream",
          "x-stt-lang": lang,
        },
        body: blob,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new TranscribeError(payload?.message ?? "Transcription failed.");
      }
      const data = (await response.json()) as { text?: string };
      return (data.text ?? "").trim();
    },
  };
}

interface Session {
  stream: MediaStreamLike;
  recorder: MediaRecorderLike;
  mimeType: string;
  chunks: Blob[];
  meter: LevelMeterLike | null;
  meterFrame: number | null;
  maxTimer: ReturnType<typeof setTimeout>;
  discarded: boolean;
}

export function useVoiceRecorder({
  onFinal,
  onLevel,
  lang,
  deps,
}: UseVoiceRecorderOptions): VoiceRecorder {
  const browserSupported = useRecorderSupported();
  const supported = deps === null ? false : deps !== undefined || browserSupported;

  const [phase, setPhase] = useState<Exclude<VoiceRecorderState, { status: "unsupported" }>>({
    status: "idle",
  });
  const sessionRef = useRef<Session | null>(null);
  const onFinalRef = useRef(onFinal);
  const onLevelRef = useRef(onLevel);
  const langRef = useRef(lang);
  useEffect(() => {
    onFinalRef.current = onFinal;
    onLevelRef.current = onLevel;
    langRef.current = lang;
  });

  const teardown = useCallback((session: Session) => {
    clearTimeout(session.maxTimer);
    if (session.meterFrame !== null) cancelAnimationFrame(session.meterFrame);
    session.meter?.close();
    for (const track of session.stream.getTracks()) track.stop();
  }, []);

  const stop = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    // onstop finishes the pipeline; teardown happens there.
    session.recorder.stop();
  }, []);

  const cancel = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.discarded = true;
    session.recorder.stop();
    setPhase({ status: "idle" });
  }, []);

  const start = useCallback(async () => {
    if (!supported || sessionRef.current) return;
    const active = deps ?? realDeps();

    let stream: MediaStreamLike;
    try {
      stream = await active.getUserMedia();
    } catch {
      setPhase({ status: "error", kind: "permission-denied" });
      return;
    }

    const { recorder, mimeType } = active.createRecorder(stream);
    const meter = active.createLevelMeter(stream);
    const session: Session = {
      stream,
      recorder,
      mimeType,
      chunks: [],
      meter,
      meterFrame: null,
      maxTimer: setTimeout(() => stop(), MAX_RECORDING_MS),
      discarded: false,
    };

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) session.chunks.push(event.data);
    };

    recorder.onstop = async () => {
      sessionRef.current = null;
      teardown(session);
      if (session.discarded) return;

      const blob = new Blob(session.chunks, { type: session.mimeType });
      if (blob.size > MAX_RECORDING_BYTES) {
        setPhase({ status: "error", kind: "too-long" });
        return;
      }
      setPhase({ status: "transcribing" });
      try {
        const text = await active.transcribe(blob, langRef.current);
        if (text) onFinalRef.current(text);
        setPhase({ status: "idle" });
      } catch {
        setPhase({ status: "error", kind: "transcribe-failed" });
      }
    };

    if (meter && typeof requestAnimationFrame === "function") {
      const tick = () => {
        onLevelRef.current?.(meter.read());
        session.meterFrame = requestAnimationFrame(tick);
      };
      session.meterFrame = requestAnimationFrame(tick);
    }

    sessionRef.current = session;
    recorder.start();
    setPhase({ status: "recording" });
  }, [supported, deps, stop, teardown]);

  // Unmount: discard any in-flight recording without uploading.
  useEffect(
    () => () => {
      const session = sessionRef.current;
      if (session) {
        sessionRef.current = null;
        session.discarded = true;
        session.recorder.onstop = null;
        session.recorder.stop();
        teardown(session);
      }
    },
    [teardown],
  );

  return {
    state: supported ? phase : { status: "unsupported" },
    start: () => void start(),
    stop,
    cancel,
  };
}
