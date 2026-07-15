"use client";

import { useEffect, useRef } from "react";
import { useSpeaker, type SpeakerDeps } from "@/lib/useSpeaker";
import { useTtsAvailability } from "@/lib/ttsAvailability";
import styles from "./SpeakerButton.module.css";

/**
 * The 🔊 control on an AI reply: one button, one contract — tap while
 * talking pauses at that exact spot, tap again resumes from it, tap
 * after the end replays. Renders nothing when the deployment has no
 * speech model (feature-detected out, like the mic — no dead button).
 *
 * With `autoPlay`, the reply starts speaking on mount (the newest Q&A
 * answer, when voice replies are on). A browser that blocks autoplay
 * degrades to the paused state — one tap starts it.
 */

export interface SpeakerButtonProps {
  /** The reply to voice; sent to /api/speak on first play. */
  text: string;
  /** Speak on mount (gated by the voice preference upstream). */
  autoPlay?: boolean;
  /** Test seam (see useSpeaker): inject a fake loader. */
  deps?: SpeakerDeps | null;
}

export function SpeakerButton({ text, autoPlay = false, deps }: SpeakerButtonProps) {
  const tts = useTtsAvailability();
  const { state, toggle, speak } = useSpeaker(text, deps);

  // Fire auto-speak exactly once per mounted reply.
  const autoPlayed = useRef(false);
  const enabled = tts === "enabled";
  useEffect(() => {
    if (!autoPlay || !enabled || autoPlayed.current) return;
    autoPlayed.current = true;
    speak();
  }, [autoPlay, enabled, speak]);

  // No speech model on this deployment → no button at all.
  if (!enabled) return null;

  const playing = state === "playing";
  const label =
    state === "playing"
      ? "Pause voice reply"
      : state === "paused"
        ? "Resume voice reply"
        : state === "ended"
          ? "Replay voice reply"
          : "Play voice reply";

  return (
    <span className={styles.wrap}>
      <button
        type="button"
        data-testid="speaker-button"
        data-state={state}
        className={playing ? `${styles.speaker} ${styles.playing}` : styles.speaker}
        aria-pressed={playing}
        aria-label={label}
        title="Voiced by this deployment's speech model; audio is never stored."
        disabled={state === "loading"}
        onClick={toggle}
      >
        {state === "loading" ? (
          <span className={styles.spinner} aria-hidden="true" />
        ) : playing ? (
          <span className={styles.bars} aria-hidden="true">
            <span className={styles.bar} />
            <span className={styles.bar} />
            <span className={styles.bar} />
          </span>
        ) : (
          <SpeakerIcon muted={state === "paused"} />
        )}
      </button>
      <span className={styles.status} role="status" aria-live="polite">
        {state === "error"
          ? "Couldn't load the voice — the text above is the answer."
          : ""}
      </span>
    </span>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
      {muted ? (
        // Paused: pause glyph beside the horn.
        <>
          <line x1="16" y1="9" x2="16" y2="15" />
          <line x1="20" y1="9" x2="20" y2="15" />
        </>
      ) : (
        // Ready: sound waves.
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9.5 9.5 0 0 1 0 13" />
        </>
      )}
    </svg>
  );
}
