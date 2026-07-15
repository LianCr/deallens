"use client";

import { useState } from "react";
import { SpeakerButton } from "@/components/VoiceInput/SpeakerButton";
import type { SpeakerDeps } from "@/lib/useSpeaker";
import { AiBadge } from "@/components/DealBrief/DealBrief";
import styles from "./FunFact.module.css";

/**
 * "One more thing" — a button that reveals one true, delightful story
 * about this exact vehicle. Reveal-on-tap by design: the question is
 * the hook, the tap bounds the cost (facts are cached per vehicle
 * server-side), and the reveal earns its moment. The 🔊 is manual and
 * uses the storyteller voice — tapping it is its own little surprise.
 */

interface FunFactProps {
  make: string;
  year: number;
  model: string;
  /** Test seam for the voice button (see useSpeaker). */
  speakerDeps?: SpeakerDeps | null;
}

type Phase = "idle" | "streaming" | "done" | "error";

interface ApiError {
  reason: string;
  message: string;
}

export function FunFact({ make, year, model, speakerDeps }: FunFactProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState<ApiError | null>(null);

  async function reveal() {
    setPhase("streaming");
    setText("");
    setError(null);
    try {
      const response = await fetch("/api/fun-fact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ make, year, model }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ApiError | null;
        setError({
          reason: payload?.reason ?? "unknown",
          message: payload?.message ?? "The storyteller is unavailable right now.",
        });
        setPhase("error");
        return;
      }
      let received = "";
      if (!response.body) {
        received = await response.text();
        setText(received);
      } else {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          received += decoder.decode(value, { stream: true });
          setText(received);
        }
        received += decoder.decode();
        setText(received);
      }
      setPhase("done");
    } catch {
      setError({ reason: "network", message: "Lost the connection mid-story. Try again." });
      setPhase("error");
    }
  }

  return (
    <div className={styles.funFact} data-testid="fun-fact">
      {phase === "idle" && (
        <button
          type="button"
          className={styles.reveal}
          data-testid="fun-fact-reveal"
          onClick={reveal}
        >
          <span aria-hidden="true">✨</span> What makes this car special?
        </button>
      )}

      {(phase === "streaming" || phase === "done") && (
        <div className={styles.card} data-testid="fun-fact-card">
          <span className={styles.cardMeta}>
            {/* This card isn't grounded in the page's numbers — its
                honesty contract is different, and the badge says so. */}
            <AiBadge
              label="AI-generated · verified where possible, sourced when web-found"
              title="One true story about this exact vehicle; the model declines rather than inventing one"
            />
            {phase === "done" && text.length > 0 && (
              <SpeakerButton text={text} voiceStyle="storyteller" deps={speakerDeps} />
            )}
          </span>
          <p className={styles.fact} aria-live="polite">
            {text}
            {phase === "streaming" && <span className={styles.cursor} aria-hidden="true" />}
          </p>
        </div>
      )}

      {phase === "error" && error && (
        <div className={styles.errorRow}>
          <p className={styles.error} role="status">
            {error.reason === "no-key"
              ? "AI is off on this deployment — no storyteller today."
              : error.message}
          </p>
          {error.reason !== "no-key" && (
            <button type="button" className={styles.reveal} onClick={reveal}>
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
