"use client";

import { useState, type FormEvent } from "react";
import { MicButton } from "@/components/VoiceInput/MicButton";
import { SpeakerButton } from "@/components/VoiceInput/SpeakerButton";
import type { SpeechRecognitionCtor } from "@/lib/useSpeechInput";
import type { SpeakerDeps } from "@/lib/useSpeaker";
import { AiBadge, ByokCard } from "./DealBrief";
import styles from "./AskThread.module.css";

/**
 * "Ask about this deal" — grounded follow-up Q&A under the AI brief.
 *
 * Same island contract as DealBrief: all grounding, rate limiting, and
 * the model call live in /api/deal-ask; this component only streams
 * text into place. Prior turns are held in state (bounded to MAX_TURNS,
 * oldest dropped) and re-sent as `turns` — the server re-injects the
 * FACTS block on every call, so the client never supplies a number.
 *
 * Voice input works exactly as on the NL finder: dictation streams
 * interim text into the (visually muted) input and the final text is
 * left editable — never auto-asked.
 */

const MAX_TURNS = 4;
const MIN_QUESTION_LENGTH = 3;
const MAX_QUESTION_LENGTH = 300;

interface AskThreadProps {
  make: string;
  year: number;
  model: string;
  quote: number;
  /** Test seam for voice input (see useSpeechInput); omit in production. */
  speechRecognitionCtor?: SpeechRecognitionCtor | null;
  /** Test seam for voice replies (see useSpeaker); omit in production. */
  speakerDeps?: SpeakerDeps | null;
}

interface Turn {
  q: string;
  a: string;
}

type Phase = "idle" | "streaming" | "error";

interface ApiError {
  reason: string;
  message: string;
}

export function AskThread({
  make,
  year,
  model,
  quote,
  speechRecognitionCtor,
  speakerDeps,
}: AskThreadProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  /** True while the input shows a live, not-yet-final dictation. */
  const [dictating, setDictating] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [streamText, setStreamText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<ApiError | null>(null);

  async function ask(question: string) {
    setPendingQuestion(question);
    setStreamText("");
    setError(null);
    setPhase("streaming");
    try {
      const response = await fetch("/api/deal-ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ make, year, model, quote, question, turns }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ApiError | null;
        setError({
          reason: payload?.reason ?? "unknown",
          message: payload?.message ?? "The AI answer is unavailable right now.",
        });
        setPhase("error");
        return;
      }
      let received = "";
      if (!response.body) {
        received = await response.text();
        setStreamText(received);
      } else {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          received += decoder.decode(value, { stream: true });
          setStreamText(received);
        }
        received += decoder.decode();
        setStreamText(received);
      }
      // Commit the finished turn; the oldest falls off past the bound.
      setTurns((previous) => [...previous, { q: question, a: received }].slice(-MAX_TURNS));
      setPendingQuestion(null);
      setStreamText("");
      setPhase("idle");
    } catch {
      setError({ reason: "network", message: "Lost the connection while answering. Try again." });
      setPhase("error");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = draft.trim();
    if (question.length < MIN_QUESTION_LENGTH || phase === "streaming") return;
    setDraft("");
    void ask(question);
  }

  const noKey = phase === "error" && error?.reason === "no-key";

  return (
    <div className={styles.thread} data-testid="ask-thread">
      {turns.map((turn, index) => (
        <div key={index} className={styles.turn}>
          <p className={styles.question}>{turn.q}</p>
          <div className={styles.answer} data-testid="ask-answer">
            <span className={styles.answerMeta}>
              <AiBadge />
              {/* The newest answer speaks on its own; its 🔊 is the one
                  control — tap pauses in place, tap resumes from there.
                  Older bubbles keep their speaker (and their spot). */}
              <SpeakerButton
                text={turn.a}
                autoPlay={index === turns.length - 1}
                deps={speakerDeps}
              />
            </span>
            <p className={styles.answerText}>{turn.a}</p>
          </div>
        </div>
      ))}

      {pendingQuestion !== null && (
        <div className={styles.turn}>
          <p className={styles.question}>{pendingQuestion}</p>
          {phase === "streaming" && (
            <div
              className={styles.answer}
              aria-live="polite"
              data-testid="ask-answer-streaming"
            >
              <AiBadge />
              <p className={styles.answerText}>
                {streamText}
                <span className={styles.cursor} aria-hidden="true" />
              </p>
            </div>
          )}
        </div>
      )}

      {phase === "error" && error && (
        noKey ? (
          <ByokCard />
        ) : (
          <div className={styles.errorRow}>
            <p className={styles.error} role="status">
              {error.message}
            </p>
            {pendingQuestion !== null && (
              <button
                type="button"
                className={styles.retry}
                onClick={() => void ask(pendingQuestion)}
              >
                Try again
              </button>
            )}
          </div>
        )
      )}

      {/* No retry form without a key: retrying can't succeed. */}
      {!noKey && (
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="deal-ask-question">
            Ask about this deal
          </label>
          <div className={styles.inputRow}>
            <input
              id="deal-ask-question"
              className={
                dictating ? `${styles.input} ${styles.inputInterim}` : styles.input
              }
              type="text"
              value={draft}
              onChange={(event) => {
                setDictating(false);
                setDraft(event.target.value);
              }}
              maxLength={MAX_QUESTION_LENGTH}
              placeholder="e.g. Is this the right month to buy?"
              disabled={phase === "streaming"}
              autoComplete="off"
            />
            {/* Feature-detected out where the API is missing — the span
                collapses via :empty, so nothing shifts either way. */}
            <span className={styles.inputAccessory} data-testid="ask-input-accessory">
              <MicButton
                recognitionCtor={speechRecognitionCtor}
                onInterim={(text) => {
                  setDictating(true);
                  setDraft(text);
                }}
                onFinal={(text) => {
                  // Editable, never auto-asked: the user reviews what was
                  // heard and presses Ask themselves.
                  setDictating(false);
                  setDraft(text);
                }}
              />
            </span>
            <button
              type="submit"
              className={styles.ask}
              disabled={phase === "streaming" || draft.trim().length < MIN_QUESTION_LENGTH}
            >
              Ask
            </button>
          </div>
          <p className={styles.hint}>
            This deal&rsquo;s pricing comes only from the numbers on this page; general
            knowledge is the model&rsquo;s own, and web research arrives with its source
            named.
          </p>
        </form>
      )}
    </div>
  );
}
