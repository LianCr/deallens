"use client";

import { useState } from "react";
import Link from "next/link";
import { MicButton } from "@/components/VoiceInput/MicButton";
import type { SpeechRecognitionCtor } from "@/lib/useSpeechInput";
import styles from "./NlFinder.module.css";

/**
 * Natural-language car finder island. Sends the shopper's sentence to
 * /api/find, which constrains the model to the real makes/years and
 * verifies every candidate against the vPIC catalog — this component
 * only renders what survived. The classic picker below never depends
 * on it.
 *
 * Voice input is progressive enhancement on top: dictation streams
 * interim text into the (visually muted) input and the final text is
 * left editable — never auto-submitted. The user confirms what was
 * heard before anything reaches the model.
 */

interface Candidate {
  make: string;
  year: number;
  model: string;
  reason: string;
  href: string;
}

interface FindResult {
  candidates: Candidate[];
  dropped: number;
}

type Phase = "idle" | "loading" | "done" | "error";

interface ApiError {
  reason: string;
  message: string;
}

interface NlFinderProps {
  /** Test seam for voice input (see useSpeechInput); omit in production. */
  speechRecognitionCtor?: SpeechRecognitionCtor | null;
}

export function NlFinder({ speechRecognitionCtor }: NlFinderProps = {}) {
  const [query, setQuery] = useState("");
  /** True while the input shows a live, not-yet-final dictation. */
  const [dictating, setDictating] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<FindResult>({ candidates: [], dropped: 0 });
  const [error, setError] = useState<ApiError | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim().length < 3 || phase === "loading") return;
    setPhase("loading");
    setError(null);
    try {
      const response = await fetch("/api/find", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ApiError | null;
        setError({
          reason: payload?.reason ?? "unknown",
          message: payload?.message ?? "AI search is unavailable right now.",
        });
        setPhase("error");
        return;
      }
      const data = (await response.json()) as FindResult;
      setResult({ candidates: data.candidates ?? [], dropped: data.dropped ?? 0 });
      setPhase("done");
    } catch {
      setError({ reason: "network", message: "Lost the connection. Try again, or use the picker below." });
      setPhase("error");
    }
  }

  return (
    <div className={styles.finder} data-testid="nl-finder">
      <form onSubmit={onSubmit} className={styles.form}>
        <label className={styles.label} htmlFor="nl-finder-input">
          Describe what you need
        </label>
        <div className={styles.row}>
          <input
            id="nl-finder-input"
            data-testid="nl-finder-input"
            className={dictating ? `${styles.input} ${styles.inputInterim}` : styles.input}
            type="text"
            value={query}
            onChange={(event) => {
              setDictating(false);
              setQuery(event.target.value);
            }}
            placeholder="e.g. reliable family SUV under $30k"
            maxLength={300}
          />
          <MicButton
            recognitionCtor={speechRecognitionCtor}
            onInterim={(text) => {
              setDictating(true);
              setQuery(text);
            }}
            onFinal={(text) => {
              // Editable, never auto-submitted: the user reviews what
              // was heard and presses the button themselves.
              setDictating(false);
              setQuery(text);
            }}
          />
          <button type="submit" className={styles.submit} disabled={phase === "loading"}>
            {phase === "loading" ? "Thinking…" : "Find candidates"}
          </button>
        </div>
      </form>

      {phase === "error" && error && (
        <p className={styles.error} role="status">
          {error.reason === "no-key"
            ? "AI search is off on this deployment (no API key). The picker below works without it."
            : error.message}
        </p>
      )}

      {phase === "done" && result.candidates.length === 0 && (
        <p className={styles.empty} role="status">
          Couldn&apos;t turn that into real vehicles from the catalog — and we won&apos;t guess.
          The picker below always works.
        </p>
      )}

      {phase === "done" && result.candidates.length > 0 && (
        <div className={styles.results}>
          <ul className={styles.cards}>
            {result.candidates.map((candidate) => (
              <li key={candidate.href}>
                <Link
                  href={candidate.href}
                  className={styles.card}
                  data-testid="nl-finder-card"
                >
                  <span className={styles.cardTitle}>
                    {candidate.year} {candidate.make} {candidate.model}
                  </span>
                  <span className={styles.cardReason}>{candidate.reason}</span>
                  <span className={styles.cardCta}>Price-check it →</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className={styles.honesty}>
            AI-suggested · every candidate verified against the NHTSA catalog
            {result.dropped > 0 &&
              ` · ${result.dropped} suggestion${result.dropped === 1 ? "" : "s"} didn't exist there and ${
                result.dropped === 1 ? "was" : "were"
              } dropped`}
          </p>
        </div>
      )}
    </div>
  );
}
