"use client";

import { useEffect } from "react";
import {
  useSpeechInput,
  type SpeechErrorKind,
  type SpeechRecognitionCtor,
} from "@/lib/useSpeechInput";
import styles from "./MicButton.module.css";

/**
 * A dictation button generic enough to sit next to any text input:
 * the host owns the input and receives interim/final text via
 * callbacks; this component owns nothing but the recognizer.
 *
 * Progressive enhancement, honestly degraded: on browsers without the
 * Web Speech API (Firefox) it renders nothing — no dead button. While
 * listening it exposes aria-pressed, a pulsing indicator, and a polite
 * live-region status; Escape or a second click cancels. The title
 * discloses that the browser's speech service transcribes the audio.
 */

export interface MicButtonProps {
  /** Live partial transcription; fires repeatedly while the user speaks. */
  onInterim: (text: string) => void;
  /**
   * The utterance the recognizer settled on; fires once per dictation.
   * The host must keep this editable and never auto-submit it — the
   * user confirms what was heard.
   */
  onFinal: (text: string) => void;
  /**
   * Test seam (see useSpeechInput): a fake constructor to drive states,
   * or `null` to force the unsupported path. Omit in production to
   * feature-detect the real browser API.
   */
  recognitionCtor?: SpeechRecognitionCtor | null;
}

const PRIVACY_NOTE =
  "Voice input is transcribed by your browser's speech service; audio never reaches DealLens servers.";

const ERROR_COPY: Record<SpeechErrorKind, string> = {
  "permission-denied": "Microphone access was denied — typing still works.",
  "no-speech": "Didn't catch anything — try again, or keep typing.",
};

export function MicButton({ onInterim, onFinal, recognitionCtor }: MicButtonProps) {
  const { state, start, cancel } = useSpeechInput({ onInterim, onFinal, recognitionCtor });
  const listening = state.status === "listening";

  // Escape cancels from anywhere on the page, not just while the
  // button holds focus — dictating users are usually watching the input.
  useEffect(() => {
    if (!listening) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [listening, cancel]);

  // Feature-detected out: no API, no button. (Also what the server
  // renders, so hydration never mismatches.)
  if (state.status === "unsupported") return null;

  const status = listening
    ? "Listening…"
    : state.status === "error"
      ? ERROR_COPY[state.kind]
      : "";

  return (
    <span className={styles.wrap}>
      <button
        type="button"
        data-testid="mic-button"
        className={listening ? `${styles.mic} ${styles.listening}` : styles.mic}
        aria-pressed={listening}
        aria-label={listening ? "Stop dictation" : "Dictate with your voice"}
        title={PRIVACY_NOTE}
        onClick={listening ? cancel : start}
      >
        <svg
          className={styles.icon}
          viewBox="0 0 24 24"
          width="18"
          height="18"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <line x1="12" y1="18" x2="12" y2="21" />
        </svg>
        {listening && <span className={styles.pulse} aria-hidden="true" />}
      </button>
      <span
        className={styles.status}
        data-testid="mic-status"
        role="status"
        aria-live="polite"
      >
        {status}
      </span>
    </span>
  );
}
