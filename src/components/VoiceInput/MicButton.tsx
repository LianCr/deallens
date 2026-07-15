"use client";

import { useEffect, useRef } from "react";
import {
  useSpeechInput,
  type SpeechErrorKind,
  type SpeechRecognitionCtor,
} from "@/lib/useSpeechInput";
import {
  useVoiceRecorder,
  type VoiceRecorderDeps,
  type VoiceRecorderErrorKind,
} from "@/lib/useVoiceRecorder";
import { useSttAvailability } from "@/lib/sttAvailability";
import {
  cycleLangPref,
  LANG_PREF_LABEL,
  resolveLang,
  useLangPref,
} from "@/lib/langPref";
import styles from "./MicButton.module.css";

/**
 * A dictation button generic enough to sit next to any text input:
 * the host owns the input and receives interim/final text via
 * callbacks; this component owns nothing but the recognizers.
 *
 * Two tiers behind one button:
 *  - Tier 2 (preferred when the deployment configures a speech model):
 *    record with MediaRecorder + a live level meter, then transcribe
 *    the whole utterance server-side — the ChatGPT dictation shape.
 *  - Tier 1 (always available where Web Speech exists): the browser's
 *    own recognizer with live interim text and silence endpointing.
 *
 * The button renders only where at least one tier can actually work —
 * honest degradation, not a dead control. Click settles (keeps what
 * was heard); Escape discards. Either way the transcript lands in an
 * editable input and is never auto-submitted.
 */

export interface MicButtonProps {
  /** Live partial transcription (tier 1 only); fires while speaking. */
  onInterim: (text: string) => void;
  /**
   * The settled transcript; fires once per dictation. The host must
   * keep this editable and never auto-submit it.
   */
  onFinal: (text: string) => void;
  /**
   * Test seam (see useSpeechInput): a fake constructor to drive states,
   * or `null` to force the no-Web-Speech path. Omit in production.
   */
  recognitionCtor?: SpeechRecognitionCtor | null;
  /**
   * Test seam (see useVoiceRecorder): fake recording deps, or `null`
   * to force the no-MediaRecorder path. Omit in production.
   */
  recorderDeps?: VoiceRecorderDeps | null;
}

const BROWSER_PRIVACY_NOTE =
  "Voice input is transcribed by your browser's speech service; audio never reaches DealLens servers.";
const SERVER_PRIVACY_NOTE =
  "Voice input is transcribed by this deployment's speech service; the audio is never stored.";

const SPEECH_ERROR_COPY: Record<SpeechErrorKind, string> = {
  "permission-denied": "Microphone access was denied — typing still works.",
  "no-speech": "Didn't catch anything — try again, or keep typing.",
};

const RECORDER_ERROR_COPY: Record<VoiceRecorderErrorKind, string> = {
  "permission-denied": "Microphone access was denied — typing still works.",
  "too-long": "That recording was too long — about 25 seconds is the max.",
  "transcribe-failed": "Couldn't transcribe that — try again, or keep typing.",
};

/** Per-bar level multipliers so the meter reads organically. */
const BAR_GAIN = [0.75, 1, 0.6, 0.9];

export function MicButton({
  onInterim,
  onFinal,
  recognitionCtor,
  recorderDeps,
}: MicButtonProps) {
  const langPref = useLangPref();
  const lang = resolveLang(langPref);
  const stt = useSttAvailability();
  const barsRef = useRef<HTMLSpanElement>(null);

  const speech = useSpeechInput({ onInterim, onFinal, recognitionCtor, lang });
  const recorder = useVoiceRecorder({
    onFinal,
    lang,
    deps: recorderDeps,
    onLevel(level) {
      const bars = barsRef.current?.children;
      if (!bars) return;
      for (let i = 0; i < bars.length; i++) {
        (bars[i] as HTMLElement).style.transform =
          `scaleY(${Math.min(1, 0.15 + level * BAR_GAIN[i % BAR_GAIN.length]!)})`;
      }
    },
  });

  const speechSupported = speech.state.status !== "unsupported";
  // The server tier is usable only when the deployment enables it.
  const serverTierReady =
    recorder.state.status !== "unsupported" && stt === "enabled";

  const listening = speech.state.status === "listening";
  const recording = recorder.state.status === "recording";
  const transcribing = recorder.state.status === "transcribing";
  const active = listening || recording;

  // Escape discards from anywhere on the page, not just while the
  // button holds focus — dictating users are usually watching the input.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (listening) speech.cancel();
      else recorder.cancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, listening, speech, recorder]);

  // Feature-detected out: neither tier can work here, so no button.
  // (Also the server render, so hydration never mismatches.)
  if (!speechSupported && !serverTierReady) return null;

  const handleClick = () => {
    if (listening) speech.stop(); // settle: keep what was heard
    else if (recording) recorder.stop(); // stop & transcribe
    else if (serverTierReady) recorder.start();
    else speech.start();
  };

  const status = listening
    ? "Listening…"
    : recording
      ? "Recording — tap to stop"
      : transcribing
        ? "Transcribing…"
        : speech.state.status === "error"
          ? SPEECH_ERROR_COPY[speech.state.kind]
          : recorder.state.status === "error"
            ? RECORDER_ERROR_COPY[recorder.state.kind]
            : "";

  return (
    <span className={styles.wrap}>
      <button
        type="button"
        data-testid="mic-button"
        className={active ? `${styles.mic} ${styles.listening}` : styles.mic}
        aria-pressed={active}
        aria-label={active ? "Stop dictation" : "Dictate with your voice"}
        title={serverTierReady ? SERVER_PRIVACY_NOTE : BROWSER_PRIVACY_NOTE}
        disabled={transcribing}
        onClick={handleClick}
      >
        {recording ? (
          <span ref={barsRef} className={styles.bars} aria-hidden="true">
            <span className={styles.bar} />
            <span className={styles.bar} />
            <span className={styles.bar} />
            <span className={styles.bar} />
          </span>
        ) : (
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
        )}
        {listening && <span className={styles.pulse} aria-hidden="true" />}
      </button>
      <button
        type="button"
        data-testid="lang-toggle"
        className={styles.langToggle}
        title="Dictation language — click to switch (Auto / English / 中文)"
        aria-label={`Dictation language: ${LANG_PREF_LABEL[langPref]}. Click to switch.`}
        onClick={() => cycleLangPref()}
      >
        {LANG_PREF_LABEL[langPref]}
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
