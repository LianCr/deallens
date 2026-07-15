"use client";

import { useState } from "react";
import { useDealTarget } from "@/lib/dealTarget";
import { SpeakerButton } from "@/components/VoiceInput/SpeakerButton";
import type { SpeakerDeps } from "@/lib/useSpeaker";
import styles from "./DealBrief.module.css";

/**
 * AI deal brief island. The heavy lifting (grounding, rate limits,
 * caching, the model call) lives in /api/deal-brief; this component only
 * streams text into place. Without JavaScript the page's verdict is
 * untouched — the brief is an enhancement, never the answer.
 */

interface DealBriefProps {
  make: string;
  year: number;
  model: string;
  quote: number;
  /** Test seam for voice replies (see useSpeaker); omit in production. */
  speakerDeps?: SpeakerDeps | null;
}

type Phase = "idle" | "streaming" | "done" | "error";

interface ApiError {
  reason: string;
  message: string;
}

/** "AI-generated" marker — rendered wherever AI output can appear. */
export function AiBadge() {
  return (
    <span className={styles.aiBadge} title="Grounded: the model may only reference server-computed numbers">
      AI-generated · grounded in the numbers above
    </span>
  );
}

/** Honest 503 state, shared with AskThread — no key, no retry theater. */
export function ByokCard() {
  return (
    <div className={styles.byok} data-testid="byok-card">
      <p className={styles.byokTitle}>Bring your own key</p>
      <p className={styles.byokBody}>
        This deployment has no Anthropic API key, so the AI brief is off. Everything else
        works — the verdict and charts never depend on AI. To enable it locally, add{" "}
        <code>ANTHROPIC_API_KEY=…</code> to <code>.env.local</code>.
      </p>
    </div>
  );
}

/**
 * Renders the brief's minimal markdown (bold paragraph headings only).
 * Tolerant of partial text mid-stream: an unfinished heading simply
 * renders as plain text until its closing ** arrives.
 */
function BriefText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((paragraph, index) => {
        const match = paragraph.match(/^\*\*([^*]+)\*\*\s*\n?([\s\S]*)$/);
        if (!match) {
          return (
            <p key={index} className={styles.paragraph}>
              {paragraph}
            </p>
          );
        }
        return (
          <p key={index} className={styles.paragraph}>
            <strong className={styles.paragraphHead}>{match[1]}</strong>
            {match[2]?.trim()}
          </p>
        );
      })}
    </>
  );
}

export function DealBrief({ make, year, model, quote, speakerDeps }: DealBriefProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState<ApiError | null>(null);

  // The explored price the QuoteExplorer published. When it differs
  // from the dealer's quote, the brief negotiates toward it — the
  // explore → decide → act loop closes here.
  const dealTarget = useDealTarget();
  const target = dealTarget !== null && dealTarget !== quote ? dealTarget : null;
  const generateLabel =
    target !== null
      ? `Draft a brief to negotiate toward $${target.toLocaleString("en-US")}`
      : "Draft my negotiation brief";

  async function generate() {
    setPhase("streaming");
    setText("");
    setError(null);
    try {
      const response = await fetch("/api/deal-brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          make,
          year,
          model,
          quote,
          ...(target !== null ? { target } : {}),
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ApiError | null;
        setError({
          reason: payload?.reason ?? "unknown",
          message: payload?.message ?? "The AI brief is unavailable right now.",
        });
        setPhase("error");
        return;
      }
      if (!response.body) {
        setText(await response.text());
        setPhase("done");
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let received = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += decoder.decode(value, { stream: true });
        setText(received);
      }
      received += decoder.decode();
      setText(received);
      setPhase("done");
    } catch {
      setError({ reason: "network", message: "Lost the connection while generating. Try again." });
      setPhase("error");
    }
  }

  return (
    <div className={styles.brief} data-testid="deal-brief">
      <p className={styles.disclaimer}>
        AI narrates, math decides — this deal&rsquo;s pricing comes only from the numbers
        above; general car advice is the model&rsquo;s own, and web research arrives with
        its source named.
      </p>

      {phase === "idle" && (
        <button type="button" className={styles.generate} onClick={generate}>
          {generateLabel}
        </button>
      )}

      {(phase === "streaming" || phase === "done") && (
        <div className={styles.output} aria-live="polite" data-testid="deal-brief-output">
          <BriefText text={text} />
          {phase === "streaming" && <span className={styles.cursor} aria-hidden="true" />}
        </div>
      )}

      {/* The brief can be read aloud, but never auto-plays — it's ~1.5
          minutes of audio; the shopper opts in with a tap. */}
      {phase === "done" && text.length > 0 && (
        <p className={styles.listenRow}>
          <SpeakerButton text={text} deps={speakerDeps} />
          <span className={styles.listenHint}>Listen to this brief</span>
        </p>
      )}

      {phase === "error" && error && (
        <>
          {error.reason === "no-key" ? (
            <ByokCard />
          ) : (
            <p className={styles.error} role="status">
              {error.message}
            </p>
          )}
          {error.reason !== "no-key" && (
            <button type="button" className={styles.generate} onClick={generate}>
              Try again
            </button>
          )}
        </>
      )}

      <noscript>
        <p className={styles.noscript}>
          The AI brief needs JavaScript — the verdict above doesn&apos;t.
        </p>
      </noscript>
    </div>
  );
}
