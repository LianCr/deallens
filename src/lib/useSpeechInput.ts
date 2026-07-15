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
  /** Abort the current dictation and discard its audio. */
  cancel: () => void;
}

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

  // Keep callback identity out of the state machine: callers may pass
  // fresh closures every render without restarting the recognizer.
  const onInterimRef = useRef(onInterim);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onInterimRef.current = onInterim;
    onFinalRef.current = onFinal;
  });

  const cancel = useCallback(() => {
    const recognizer = recognizerRef.current;
    if (!recognizer) return;
    recognizerRef.current = null;
    // Detach before aborting so the recognizer's own "aborted" error /
    // end events can't race the state we set here.
    detachHandlers(recognizer);
    recognizer.abort();
    setPhase({ status: "idle" });
  }, []);

  const start = useCallback(() => {
    // No-op while unsupported or already listening; restarting from an
    // error state is allowed (the previous recognizer already ended).
    if (!ctor || recognizerRef.current) return;

    const recognizer = new ctor();
    recognizer.lang =
      lang ?? ((typeof navigator !== "undefined" && navigator.language) || "en-US");
    // ChatGPT-style live transcription + auto-stop on silence.
    recognizer.interimResults = true;
    recognizer.continuous = false;
    erroredRef.current = false;

    recognizer.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i]?.[0]?.transcript ?? "";
        if (event.results[i]?.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      if (finalText) onFinalRef.current(finalText.trim());
      else onInterimRef.current(interimText);
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
      // An error already set its own state; keep it visible until the
      // user retries instead of flashing back to idle.
      if (!erroredRef.current) setPhase({ status: "idle" });
    };

    recognizerRef.current = recognizer;
    recognizer.start();
    setPhase({ status: "listening" });
  }, [ctor, lang]);

  // Unmount: silently drop any in-flight dictation.
  useEffect(
    () => () => {
      const recognizer = recognizerRef.current;
      if (recognizer) {
        recognizerRef.current = null;
        detachHandlers(recognizer);
        recognizer.abort();
      }
    },
    [],
  );

  return { state: ctor ? phase : { status: "unsupported" }, start, cancel };
}
