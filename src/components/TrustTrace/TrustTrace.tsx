import type { DealExplanation } from "@/domain/explainDeal";
import styles from "./TrustTrace.module.css";

/**
 * Pricing receipt — auditable steps from explainDeal().
 *
 * Why this is not LLM prose: the model may only restate numbers the
 * domain layer already produced. Trust Trace *is* that domain layer,
 * rendered. No second scoring path.
 */
export interface TrustTraceProps {
  explanation: DealExplanation;
  /** DEMO | REAL — honesty footer. */
  dataSource?: "DEMO" | "REAL";
}

export function TrustTrace({ explanation, dataSource = "DEMO" }: TrustTraceProps) {
  return (
    <details className={styles.trace} data-testid="trust-trace">
      <summary className={styles.summary} data-testid="trust-trace-summary">
        <span className={styles.summaryLabel}>{explanation.summary}</span>
      </summary>
      <div className={styles.receipt} data-testid="trust-trace-receipt">
        <ol className={styles.steps}>
          {explanation.steps.map((step) => (
            <li key={step.id} className={styles.step}>
              <span className={styles.stepLabel}>{step.label}</span>
              <span className={styles.stepDetail}>{step.detail}</span>
            </li>
          ))}
        </ol>
        <p className={styles.footer}>
          {dataSource === "DEMO" ? (
            <>
              Pricing: demo dataset ·{" "}
              <a
                href="https://github.com/LianCr/deallens#methodology"
                className={styles.footerLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                Methodology
              </a>
            </>
          ) : (
            <>Pricing: real market source</>
          )}
          {" · "}
          Same pure functions as the hero verdict — not AI-written.
        </p>
      </div>
    </details>
  );
}
