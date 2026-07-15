"use client";

/**
 * QuoteExplorer — the hero verdict plus a draggable "what if the quote
 * were different?" slider.
 *
 * The isomorphic-JavaScript proof, stated in code: the verdict the
 * server rendered came from `assessDeal` in the pure domain layer, and
 * dragging the slider reruns the *same imported function* on the same
 * market samples in the browser. No client-side approximation of the
 * server's math — the server's math, moved to the client.
 *
 * Progressive enhancement, both directions:
 *  - Without JavaScript this component still server-renders the full
 *    hero, and the slider is a plain GET form — submit it and the
 *    server recomputes the verdict for the new quote.
 *  - With JavaScript the verdict, percentile, and the chart's quote
 *    marker (transform-only, via the data hooks ChartSvg exposes)
 *    update live, and the URL keeps tracking the explored quote via
 *    replaceState so the link stays shareable.
 */
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Verdict } from "@/domain/types";
import { assessDeal, MIN_SAMPLE_SIZE } from "@/domain/verdict";
import {
  formatDollars,
  quoteMarkerLayout,
} from "@/components/charts/PriceContextChart/markerLayout";
import styles from "./QuoteExplorer.module.css";

const VERDICT_COPY: Record<Verdict, { headline: string; tone: string }> = {
  GREAT_DEAL: { headline: "Great deal", tone: "good" },
  FAIR: { headline: "Fair price", tone: "neutral" },
  ABOVE_MARKET: { headline: "Above market", tone: "bad" },
  INSUFFICIENT_DATA: { headline: "Not enough data to say", tone: "neutral" },
};

const ordinal = (n: number): string => {
  const rem10 = n % 10;
  const rem100 = n % 100;
  if (rem10 === 1 && rem100 !== 11) return `${n}st`;
  if (rem10 === 2 && rem100 !== 12) return `${n}nd`;
  if (rem10 === 3 && rem100 !== 13) return `${n}rd`;
  return `${n}th`;
};

function verdictDetail(
  quote: number,
  verdict: Verdict,
  percentile: number | null,
  median: number | null,
): string {
  if (verdict === "INSUFFICIENT_DATA" || median === null) {
    return "This market is too thin to judge honestly — and we won't guess.";
  }
  const delta = Math.round(quote - median);
  const abs = Math.abs(delta).toLocaleString("en-US");
  const deltaText =
    delta === 0
      ? "Right at the median"
      : `$${abs} ${delta < 0 ? "below" : "above"} the median`;
  const pctText =
    percentile === null
      ? ""
      : `, at the ${ordinal(Math.round(percentile))} percentile of this market`;
  return `${deltaText} of comparable listings${pctText}.`;
}

/** Slider granularity — nobody haggles in sub-$50 steps. */
const QUOTE_STEP = 50;

const floorToStep = (value: number): number =>
  Math.max(QUOTE_STEP, Math.floor(value / QUOTE_STEP) * QUOTE_STEP);
const ceilToStep = (value: number): number =>
  Math.ceil(value / QUOTE_STEP) * QUOTE_STEP;

export interface QuoteExplorerProps {
  /** Raw market prices — the same sample the server's verdict used. */
  samples: readonly number[];
  /** The dealer's actual quote, from the URL. */
  initialQuote: number;
  /** Server-computed market median; null when the market is too thin. */
  median: number | null;
  /** Distribution chart domain, for moving its quote marker in step. */
  domain: { lo: number; hi: number } | null;
  /** Path of this deal page, for the no-JS form fallback. */
  vehiclePath: string;
  contactHref: string;
  /** Server-rendered sections whose quote marker follows the slider. */
  children?: ReactNode;
}

export function QuoteExplorer({
  samples,
  initialQuote,
  median,
  domain,
  vehiclePath,
  contactHref,
  children,
}: QuoteExplorerProps) {
  const [quote, setQuote] = useState(initialQuote);
  const chartHostRef = useRef<HTMLDivElement>(null);
  const skippedFirstSync = useRef(false);

  const { verdict, percentile } = assessDeal(quote, samples);
  const copy = VERDICT_COPY[verdict];
  const explorable = samples.length >= MIN_SAMPLE_SIZE;

  // Slider range: the whole market plus padding, always containing the
  // dealer's quote so the starting position is exact.
  const sampleLo = explorable ? Math.min(...samples, initialQuote) : initialQuote;
  const sampleHi = explorable ? Math.max(...samples, initialQuote) : initialQuote;
  const pad = Math.max(500, Math.round((sampleHi - sampleLo) * 0.08));
  const sliderMin = floorToStep(sampleLo - pad);
  const sliderMax = ceilToStep(sampleHi + pad);

  // Keep the shared URL honest about what's on screen. Debounced so a
  // drag is one history entry's worth of churn, not hundreds.
  useEffect(() => {
    if (!skippedFirstSync.current) {
      skippedFirstSync.current = true;
      return;
    }
    const timer = setTimeout(() => syncUrl(quote), 250);
    return () => clearTimeout(timer);
  }, [quote]);

  // Move the server-rendered chart's quote marker: transform and text
  // only, through the data hooks ChartSvg exposes — the distribution
  // paths are never redrawn.
  useEffect(() => {
    const host = chartHostRef.current;
    if (!host || !domain) return;
    const marker = host.querySelector<SVGGElement>("[data-quote-marker]");
    const label = host.querySelector<SVGTextElement>("[data-quote-label]");
    if (!marker || !label) return;
    const from = quoteMarkerLayout(initialQuote, domain.lo, domain.hi);
    const to = quoteMarkerLayout(quote, domain.lo, domain.hi);
    marker.setAttribute("transform", `translate(${to.x - from.x} 0)`);
    label.setAttribute("text-anchor", to.anchor);
    label.textContent = `your quote ${formatDollars(quote)}`;
    host
      .querySelector("[data-axis-lo]")
      ?.setAttribute("visibility", to.showLoLabel ? "visible" : "hidden");
    host
      .querySelector("[data-axis-hi]")
      ?.setAttribute("visibility", to.showHiLabel ? "visible" : "hidden");
  }, [quote, initialQuote, domain]);

  // With JavaScript the form never navigates — the verdict is already
  // live; submitting just flushes the URL immediately.
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    syncUrl(quote);
  };

  return (
    <>
      <section
        className={styles.hero}
        data-tone={copy.tone}
        data-testid="verdict-hero"
      >
        <p className={styles.heroQuote}>
          {quote === initialQuote ? "Dealer quote: " : "Exploring: "}
          <strong>${quote.toLocaleString("en-US")}</strong>
        </p>
        <h2 className={styles.heroVerdict}>{copy.headline}</h2>
        <p className={styles.heroDetail} aria-live="polite">
          {verdictDetail(quote, verdict, percentile, median)}
        </p>

        {explorable && (
          <form
            method="get"
            action={vehiclePath}
            onSubmit={handleSubmit}
            className={styles.explorer}
            data-testid="quote-explorer"
          >
            <label className={styles.explorerLabel} htmlFor="quote-explorer-input">
              What if the quote were different? Drag to explore
            </label>
            <div className={styles.explorerRow}>
              <span className={styles.explorerBound} aria-hidden>
                {formatDollars(sliderMin)}
              </span>
              <input
                id="quote-explorer-input"
                name="quote"
                type="range"
                min={sliderMin}
                max={sliderMax}
                step={QUOTE_STEP}
                value={quote}
                aria-valuetext={formatDollars(quote)}
                onChange={(event) => setQuote(Number(event.target.value))}
                className={styles.explorerRange}
              />
              <span className={styles.explorerBound} aria-hidden>
                {formatDollars(sliderMax)}
              </span>
              <button type="submit" className={styles.explorerSubmit}>
                Check this quote
              </button>
            </div>
          </form>
        )}

        <p className={styles.heroCta}>
          <Link href={contactHref} className={styles.contactLink}>
            Contact the dealer →
          </Link>
        </p>
      </section>

      <div ref={chartHostRef}>{children}</div>
    </>
  );
}

function syncUrl(quote: number): void {
  const url = new URL(window.location.href);
  url.searchParams.set("quote", String(quote));
  // Preserve the router's history state — Next.js keeps data there.
  window.history.replaceState(window.history.state, "", url);
}
