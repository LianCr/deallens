"use client";

import { PriceContextChart } from "@/components/charts/PriceContextChart";
import { buildHistogram } from "@/domain/histogram";
import type { EvidenceBundle, StructuredResearchRecommendation } from "@/research/types";
import styles from "./ResearchReportView.module.css";

const VERDICT_LABEL: Record<string, string> = {
  GREAT_DEAL: "Great deal",
  FAIR: "Fair price",
  ABOVE_MARKET: "Above market",
  INSUFFICIENT_DATA: "Not enough data",
};

interface Payload {
  bundle: EvidenceBundle;
  ai: StructuredResearchRecommendation | null;
  persisted?: boolean;
}

export function ResearchReportView({ payload }: { payload: unknown }) {
  const data = payload as Payload;
  if (!data?.bundle) return null;
  const { bundle, ai, persisted } = data;
  const prices = bundle.comparables.observations.map((o) => o.price);
  const buckets = buildHistogram(prices);
  const dollars = (n: number | null) =>
    n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`;

  return (
    <article className={styles.report} aria-label="Research report">
      <header className={styles.hero}>
        <p className={styles.eyebrow}>
          Evidence-backed research · {bundle.collectorMode === "LIVE_SEARCH" ? "live search" : "demo fallback"}
          {persisted ? " · saved" : ""}
        </p>
        <h2 className={styles.title}>
          {bundle.target.year} {bundle.target.make} {bundle.target.model}
          {bundle.target.trim ? ` ${bundle.target.trim}` : ""}
        </h2>
        <p className={styles.lede}>
          Asking <span className="price-figure">{dollars(bundle.target.price)}</span>
          {bundle.target.mileage != null && (
            <> · {bundle.target.mileage.toLocaleString("en-US")} miles</>
          )}
          . We found <strong>{bundle.comparables.sampleSize}</strong> comparable listings
          {bundle.comparables.median != null && (
            <>
              ; median {dollars(bundle.comparables.median)}
            </>
          )}
          {bundle.percentile != null && (
            <>
              ; {Math.round(bundle.percentile)}th percentile
            </>
          )}
          . Confidence: <strong>{bundle.comparables.confidence}</strong>
          {bundle.comparables.missingTrimCount > 0 && (
            <> ({bundle.comparables.missingTrimCount} missing trim)</>
          )}
          .
        </p>
        <p className={styles.verdict} data-verdict={bundle.verdict}>
          {VERDICT_LABEL[bundle.verdict] ?? bundle.verdict}
        </p>
        <p className={styles.badge}>
          Data: {bundle.dataSource}
          {bundle.target.source.sourceUrl.startsWith("http") && (
            <>
              {" · "}
              <a href={bundle.target.source.sourceUrl} rel="noopener noreferrer">
                Target source
              </a>
            </>
          )}
        </p>
      </header>

      {buckets.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Where this ask lands</h3>
          <PriceContextChart
            buckets={buckets}
            quote={bundle.target.price}
            p25={bundle.comparables.p25}
            median={bundle.comparables.median}
            p75={bundle.comparables.p75}
          />
        </section>
      )}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Comparable listings</h3>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Listing</th>
                <th>Price</th>
                <th>Year</th>
                <th>Mileage</th>
                <th>Trim</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {bundle.comparables.included.map((o) => (
                <tr key={o.id}>
                  <td>{o.title}</td>
                  <td className="price-figure">{dollars(o.price)}</td>
                  <td>{o.year}</td>
                  <td>{o.mileage != null ? o.mileage.toLocaleString("en-US") : "—"}</td>
                  <td>{o.trim ?? "—"}</td>
                  <td>
                    <a href={o.source.sourceUrl} rel="noopener noreferrer">
                      {o.source.sourceName}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {bundle.comparables.exclusions.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Why some listings were excluded</h3>
          <ul className={styles.exclusions}>
            {bundle.comparables.exclusions.slice(0, 12).map((ex) => (
              <li key={`${ex.itemId}-${ex.reason}`}>
                <code>{ex.itemId}</code> — {ex.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Trust Trace</h3>
        <ol className={styles.trace}>
          {bundle.explainSteps.map((step) => (
            <li key={step.id}>
              <strong>{step.label}.</strong> {step.detail}
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>AI research report</h3>
        {ai ? (
          <div className={styles.ai}>
            <p className={styles.aiRec}>{ai.recommendation}</p>
            <p>{ai.reasoning}</p>
            <p className={styles.meta}>{ai.confidenceExplanation}</p>
            {ai.risks.length > 0 && (
              <>
                <h4>Risks</h4>
                <ul>
                  {ai.risks.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </>
            )}
            {ai.followUpQuestions.length > 0 && (
              <>
                <h4>Verify before buying</h4>
                <ul>
                  {ai.followUpQuestions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </>
            )}
            <p className={styles.meta}>
              Grounded evidence ids: {ai.evidenceIds.join(", ") || "—"} · AI narrates, math decides
            </p>
          </div>
        ) : (
          <p className={styles.meta}>
            AI report unavailable (no key or budget). The math, comparables, and Trust Trace above
            still stand.
          </p>
        )}
      </section>
    </article>
  );
}
