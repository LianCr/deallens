"use client";

/**
 * QuoteExplorer — the hero verdict plus a draggable "what if the quote
 * were different?" slider, upgraded from a readout into a negotiation
 * decision tool: the track is colored by verdict zone, the quartiles
 * are soft snap detents, three counter-offer chips give the drag a
 * destination, and the explored price flows into the actions around it
 * (the AI brief targets it, the contact link carries it as an offer).
 *
 * The isomorphic-JavaScript proof, stated in code: the verdict the
 * server rendered came from `assessDeal` in the pure domain layer, and
 * dragging the slider reruns the *same imported function* on the same
 * market samples in the browser. The zones and chips reuse
 * `percentileValue`/`percentileRank` the same way (see explorerMath.ts).
 *
 * Progressive enhancement, both directions:
 *  - Without JavaScript this component still server-renders the full
 *    hero, the slider is a plain GET form, and each chip is a real
 *    link — the server recomputes the verdict either way.
 *  - With JavaScript the verdict, percentile, chart markers, URL
 *    (replaceState, debounced), and the shared deal target update live.
 */
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { Verdict } from "@/domain/types";
import { assessDeal, MIN_SAMPLE_SIZE } from "@/domain/verdict";
import { percentileValue } from "@/domain/percentile";
import { setDealTarget } from "@/lib/dealTarget";
import {
  formatDollars,
  quoteMarkerLayout,
} from "@/components/charts/PriceContextChart/markerLayout";
import {
  ceilToStep,
  counterOffers,
  floorToStep,
  QUOTE_STEP,
  snapDetents,
  snapToDetent,
  zoneStops,
} from "./explorerMath";
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

/** Anchored comparison: the dealer's quote never disappears while exploring. */
function savingsLine(quote: number, initialQuote: number): string {
  const delta = quote - initialQuote;
  if (delta === 0) return "";
  const abs = Math.abs(delta).toLocaleString("en-US");
  return delta < 0
    ? `You'd save $${abs} vs the dealer's quote.`
    : `That's $${abs} more than the dealer asked.`;
}

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

  // Verdict zones, snap detents, and counter-offer chips — all pure
  // functions of the same samples the verdict uses, all deterministic,
  // so the server-rendered island and the hydrated island agree. When
  // the market is too thin (`explorable` false) none of this renders:
  // the honest empty state owns the hero instead.
  const detents = explorable ? snapDetents(samples) : null;
  const offers = explorable ? counterOffers(samples) : null;
  const p25 = explorable ? percentileValue(samples, 25) : null;
  const p75 = explorable ? percentileValue(samples, 75) : null;
  const stops =
    p25 !== null && p75 !== null ? zoneStops(p25, p75, sliderMin, sliderMax) : null;
  const trackStyle = stops
    ? ({
        "--zone-track": `linear-gradient(to right, var(--zone-great) 0% ${stops.greatEndPct}%, var(--zone-fair) ${stops.greatEndPct}% ${stops.fairEndPct}%, var(--zone-above) ${stops.fairEndPct}% 100%)`,
      } as CSSProperties)
    : undefined;

  // Only the median tick carries text: one label can't crowd its
  // neighbors when the market clusters in a sliver of the range (a real
  // failure mode — a quote far outside the market stretches the track,
  // and "P25 median P75" mashed into overlap). The quartile ticks stay
  // as quiet marks — the colored zones and the chips below carry their
  // meaning in plain words.
  const detentTicks = detents
    ? ([
        { key: "p25", label: null, value: detents.p25 },
        { key: "median", label: "median", value: detents.median },
        { key: "p75", label: null, value: detents.p75 },
      ] as const)
    : null;
  const span = sliderMax - sliderMin;

  // Keep the shared URL honest about what's on screen, and publish the
  // explored price to the deal-target store so the actions below (the
  // AI brief) aim at it. Debounced so a drag is one entry's worth of
  // churn, not hundreds.
  useEffect(() => {
    if (!skippedFirstSync.current) {
      skippedFirstSync.current = true;
      return;
    }
    const timer = setTimeout(() => {
      syncUrl(quote);
      setDealTarget(quote === initialQuote ? null : quote);
    }, 250);
    return () => clearTimeout(timer);
  }, [quote, initialQuote]);

  // Leaving the page withdraws the target — it belongs to this deal only.
  useEffect(() => () => setDealTarget(null), []);

  // Move the server-rendered chart's quote marker: transform and text
  // only, through the data hooks ChartSvg exposes — the distribution
  // paths are never redrawn. The dimmed origin marker fades in whenever
  // the explored quote leaves the dealer's, so reality stays anchored.
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
    host
      .querySelector("[data-quote-origin]")
      ?.setAttribute("opacity", quote === initialQuote ? "0" : "0.4");
  }, [quote, initialQuote, domain]);

  // With JavaScript the form never navigates — the verdict is already
  // live; submitting just flushes the URL immediately.
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    syncUrl(quote);
  };

  // Chips are real links (the no-JS path); with JavaScript a click is
  // an instant local jump — verdict, URL, and target, no navigation.
  const pickOffer = (event: MouseEvent<HTMLAnchorElement>, value: number) => {
    event.preventDefault();
    setQuote(value);
    syncUrl(value);
    setDealTarget(value === initialQuote ? null : value);
  };

  const exploring = quote !== initialQuote;
  const contactUrl = exploring
    ? `${contactHref}${contactHref.includes("?") ? "&" : "?"}offer=${quote}`
    : contactHref;

  return (
    <>
      <section
        className={styles.hero}
        data-tone={copy.tone}
        data-testid="verdict-hero"
      >
        <p className={styles.heroQuote}>
          {exploring ? "Exploring: " : "Dealer quote: "}
          <strong>${quote.toLocaleString("en-US")}</strong>
        </p>
        <h2 className={styles.heroVerdict}>{copy.headline}</h2>
        <p className={styles.heroDetail} aria-live="polite">
          {verdictDetail(quote, verdict, percentile, median)}
        </p>
        {/* Fixed-height slot: the savings line appears and disappears
            while dragging without moving anything below it. */}
        <p className={styles.savingsLine} data-testid="savings-line" aria-live="polite">
          {savingsLine(quote, initialQuote)}
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
              <div className={styles.trackWrap}>
                <input
                  id="quote-explorer-input"
                  name="quote"
                  type="range"
                  min={sliderMin}
                  max={sliderMax}
                  step={QUOTE_STEP}
                  value={quote}
                  aria-valuetext={formatDollars(quote)}
                  onChange={(event) => {
                    const raw = Number(event.target.value);
                    setQuote(
                      detents
                        ? snapToDetent(
                            raw,
                            [detents.p25, detents.median, detents.p75],
                            sliderMin,
                            sliderMax,
                          )
                        : raw,
                    );
                  }}
                  className={styles.explorerRange}
                  style={trackStyle}
                />
                {detentTicks && span > 0 && (
                  <div className={styles.detents} aria-hidden="true">
                    {detentTicks.map((tick) => (
                      <span
                        key={tick.key}
                        className={styles.detent}
                        style={{ left: `${((tick.value - sliderMin) / span) * 100}%` }}
                        title={formatDollars(tick.value)}
                      >
                        <span className={styles.detentTick} />
                        {tick.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span className={styles.explorerBound} aria-hidden>
                {formatDollars(sliderMax)}
              </span>
              <button type="submit" className={styles.explorerSubmit}>
                Check this quote
              </button>
            </div>

            {offers && (
              <div className={styles.chips} data-testid="counter-offers">
                {offers.map((offer) => (
                  <a
                    key={offer.id}
                    href={`${vehiclePath}?quote=${offer.value}`}
                    className={styles.chip}
                    data-testid={`chip-${offer.id}`}
                    aria-current={quote === offer.value ? "true" : undefined}
                    onClick={(event) => pickOffer(event, offer.value)}
                  >
                    <span className={styles.chipLabel}>
                      {offer.label} {formatDollars(offer.value)}
                    </span>
                    <span className={styles.chipGrounding}>{offer.grounding}</span>
                  </a>
                ))}
              </div>
            )}
          </form>
        )}

        <p className={styles.heroCta}>
          <Link href={contactUrl} className={styles.contactLink}>
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
