"use client";

import { useState, type FormEvent, type ReactNode } from "react";
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
 */

const MAX_TURNS = 4;
const MIN_QUESTION_LENGTH = 3;
const MAX_QUESTION_LENGTH = 300;

interface AskThreadProps {
  make: string;
  year: number;
  model: string;
  quote: number;
  /**
   * Optional control rendered as a sibling of the question input (its
   * slot always exists in the DOM) — reserved for a future voice-input
   * mic button. Not built here; this is only the mount point.
   */
  inputAccessory?: ReactNode;
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

export function AskThread({ make, year, model, quote, inputAccessory }: AskThreadProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
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
            <AiBadge />
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
              className={styles.input}
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={MAX_QUESTION_LENGTH}
              placeholder="e.g. Is this the right month to buy?"
              disabled={phase === "streaming"}
              autoComplete="off"
            />
            {/* Sibling slot for a future mic button (voice-input milestone). */}
            <span className={styles.inputAccessory} data-testid="ask-input-accessory">
              {inputAccessory}
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
            Answers come only from the numbers on this page — anything else gets an honest
            &ldquo;can&rsquo;t say&rdquo;.
          </p>
        </form>
      )}
    </div>
  );
}
