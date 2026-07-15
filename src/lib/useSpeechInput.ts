"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Dictation via the browser-native Web Speech API, as progressive
 * enhancement. No vendor key, no bundle cost: `interimResults` gives
 * ChatGPT-style live transcription for free where the API exists, and
 * where it doesn't (Firefox) the caller feature-detects the control
 * away entirely instead of shipping a dead button.
 *
 * The recognizer constructor is injectable — same pattern as the
 * injectable clock in src/ai/guard.ts — so unit tests drive every
 * state transition with a fake recognizer and never need a microphone.
 * See docs/adr/006-voice-input.md for the decision record.
 */

/** The slice of SpeechRecognition results this hook actually reads. */
export interface SpeechAlternativeLike {
  transcript: string;
}

export interface SpeechResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechAlternativeLike | undefined;
}

export interface SpeechResultEventLike {
  readonly results: ArrayLike<SpeechResultLike>;
}

export interface SpeechErrorEventLike {
  /** Web Speech error code, e.g. "not-allowed", "no-speech", "aborted". */
  readonly error: string;
}

/**
 * The slice of the SpeechRecognition interface this hook drives.
 * lib.dom doesn't ship the (still prefixed-in-places) Web Speech types,
 * so we declare the structural subset we use — which is also exactly
 * what a fake recognizer has to implement in tests.
 */
export interface SpeechRecognizerLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: SpeechErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
  /** Graceful settle: flush pending finals, then end. Optional because
      older fakes/browsers may lack it; we fall back to abort + flush. */
  stop?(): void;
}

export type SpeechRecognitionCtor = new () => SpeechRecognizerLike;

export type SpeechErrorKind = "permission-denied" | "no-speech";

export type SpeechInputState =
  | { status: "unsupported" }
  | { status: "idle" }
  | { status: "listening" }
  | { status: "error"; kind: SpeechErrorKind };

/**
 * Feature detection: standard name first, then the webkit prefix Chrome
 * and Safari still ship. Returns undefined on the server and on
 * browsers without the API (Firefox) — the honest-degradation path.
 */
export function detectSpeechRecognition(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export interface UseSpeechInputOptions {
  /** Live partial transcription; fires repeatedly while the user speaks. */
  onInterim: (text: string) => void;
  /** The utterance the recognizer settled on; fires once per dictation. */
  onFinal: (text: string) => void;
  /**
   * Test seam: pass a fake constructor to drive states, or `null` to
   * force the unsupported path. `undefined` (the default) feature-
   * detects the real browser API — via useSyncExternalStore, so the
   * server render and hydration agree ("unsupported") and the button
   * appears only on browsers that actually have the API.
   */
  recognitionCtor?: SpeechRecognitionCtor | null;
  /** BCP 47 language tag; defaults to the browser's UI language. */
  lang?: string;
}

export interface SpeechInput {
  state: SpeechInputState;
  /** Begin a dictation. No-op while unsupported or already listening. */
  start: () => void;
  /** Settle the dictation: keep what was heard and stop listening. */
  stop: () => void;
  /** Abort the current dictation and discard its audio. */
  cancel: () => void;
}

/**
 * How long the user can pause mid-sentence before we settle the
 * dictation. With `continuous: true` the browser no longer cuts off at
 * the first breath — this timer is the endpointer instead, and it only
 * arms after the first result so "click mic, then think" still works.
 */
export const SILENCE_SETTLE_MS = 1600;

/** The window's constructor never changes after load; no subscription. */
const subscribeNever = () => () => {};
const detectClient = () => detectSpeechRecognition() ?? null;
const detectServer = () => null;

const detachHandlers = (recognizer: SpeechRecognizerLike) => {
  recognizer.onresult = null;
  recognizer.onerror = null;
  recognizer.onend = null;
};

export function useSpeechInput({
  onInterim,
  onFinal,
  recognitionCtor,
  lang,
}: UseSpeechInputOptions): SpeechInput {
  const detected = useSyncExternalStore(subscribeNever, detectClient, detectServer);
  const ctor = recognitionCtor === undefined ? detected : recognitionCtor;

  // The live part of the state machine; "unsupported" is derived from
  // the (absent) constructor below, not stored.
  const [phase, setPhase] = useState<Exclude<SpeechInputState, { status: "unsupported" }>>(
    { status: "idle" },
  );
  const recognizerRef = useRef<SpeechRecognizerLike | null>(null);
  const erroredRef = useRef(false);
  /** Final segments settled so far in this dictation session. */
  const finalsRef = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep callback identity out of the state machine: callers may pass
  // fresh closures every render without restarting the recognizer.
  const onInterimRef = useRef(onInterim);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onInterimRef.current = onInterim;
    onFinalRef.current = onFinal;
  });

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    const recognizer = recognizerRef.current;
    if (!recognizer) return;
    recognizerRef.current = null;
    clearSilenceTimer();
    finalsRef.current = "";
    // Detach before aborting so the recognizer's own "aborted" error /
    // end events can't race the state we set here.
    detachHandlers(recognizer);
    recognizer.abort();
    setPhase({ status: "idle" });
  }, [clearSilenceTimer]);

  const stop = useCallback(() => {
    const recognizer = recognizerRef.current;
    if (!recognizer) return;
    clearSilenceTimer();
    if (recognizer.stop) {
      // Graceful path: the recognizer flushes pending finals and then
      // fires onend, where the session settles.
      recognizer.stop();
      return;
    }
    // No stop(): settle manually with what we have.
    recognizerRef.current = null;
    detachHandlers(recognizer);
    recognizer.abort();
    const finals = finalsRef.current.trim();
    finalsRef.current = "";
    if (finals) onFinalRef.current(finals);
    setPhase({ status: "idle" });
  }, [clearSilenceTimer]);

  const start = useCallback(() => {
    // No-op while unsupported or already listening; restarting from an
    // error state is allowed (the previous recognizer already ended).
    if (!ctor || recognizerRef.current) return;

    const recognizer = new ctor();
    recognizer.lang =
      lang ?? ((typeof navigator !== "undefined" && navigator.language) || "en-US");
    // Live transcription that survives mid-sentence pauses: continuous
    // mode plus our own silence endpointer (SILENCE_SETTLE_MS), instead
    // of the browser's cut-off-at-the-first-breath default.
    recognizer.interimResults = true;
    recognizer.continuous = true;
    erroredRef.current = false;
    finalsRef.current = "";

    recognizer.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i]?.[0]?.transcript ?? "";
        if (event.results[i]?.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      finalsRef.current = finalText;
      // Everything heard so far — settled segments plus the live tail —
      // streams to the host as one growing interim string.
      onInterimRef.current((finalText + interimText).trim());
      // Endpointing arms only once the user has said something.
      clearSilenceTimer();
      silenceTimerRef.current = setTimeout(() => stop(), SILENCE_SETTLE_MS);
    };

    recognizer.onerror = (event) => {
      // "aborted" is our own cancel echoing back; cancel() already
      // detached, but a recognizer may still fire before abort() returns.
      if (event.error === "aborted") return;
      erroredRef.current = true;
      const kind: SpeechErrorKind =
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "permission-denied"
          : "no-speech";
      setPhase({ status: "error", kind });
    };

    recognizer.onend = () => {
      recognizerRef.current = null;
      clearSilenceTimer();
      const finals = finalsRef.current.trim();
      finalsRef.current = "";
      // The dictation settles once per session, when it ends — not on
      // every intermediate final segment.
      if (!erroredRef.current && finals) onFinalRef.current(finals);
      // An error already set its own state; keep it visible until the
      // user retries instead of flashing back to idle.
      if (!erroredRef.current) setPhase({ status: "idle" });
    };

    recognizerRef.current = recognizer;
    recognizer.start();
    setPhase({ status: "listening" });
  }, [ctor, lang, clearSilenceTimer, stop]);

  // Unmount: silently drop any in-flight dictation.
  useEffect(
    () => () => {
      const recognizer = recognizerRef.current;
      if (recognizer) {
        recognizerRef.current = null;
        detachHandlers(recognizer);
        recognizer.abort();
      }
      if (silenceTimerRef.current !== null) clearTimeout(silenceTimerRef.current);
    },
    [],
  );

  return { state: ctor ? phase : { status: "unsupported" }, start, stop, cancel };
}
