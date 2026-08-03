import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { explainDeal } from "@/domain/explainDeal";
import { TrustTrace } from "./TrustTrace";

const market = Array.from({ length: 21 }, (_, i) => 20_000 + i * 500);

describe("TrustTrace", () => {
  test("collapsed summary shows how we scored this", () => {
    const explanation = explainDeal(25_000, market);
    render(<TrustTrace explanation={explanation} />);
    expect(screen.getByTestId("trust-trace-summary")).toHaveTextContent(
      /How we scored this · n=21/i,
    );
  });

  test("receipt lists audit steps and demo methodology footer", () => {
    const explanation = explainDeal(25_000, market);
    render(<TrustTrace explanation={explanation} dataSource="DEMO" />);
    const receipt = screen.getByTestId("trust-trace-receipt");
    expect(receipt).toHaveTextContent(/Sample size/);
    expect(receipt).toHaveTextContent(/Verdict rules/);
    expect(receipt).toHaveTextContent(/≤ P25/);
    expect(receipt).toHaveTextContent(/Methodology/);
    expect(receipt).toHaveTextContent(/not AI-written/i);
  });

  test("thin market shows insufficient outcome in the receipt", () => {
    const explanation = explainDeal(22_000, [20_000, 21_000, 22_000]);
    render(<TrustTrace explanation={explanation} />);
    expect(screen.getByTestId("trust-trace-summary")).toHaveTextContent(
      /insufficient/i,
    );
    expect(screen.getByTestId("trust-trace-receipt")).toHaveTextContent(
      /INSUFFICIENT_DATA/,
    );
  });

  test("hero-aligned fair verdict appears in outcome step", () => {
    const explanation = explainDeal(25_000, market);
    expect(explanation.assessment.verdict).toBe("FAIR");
    render(<TrustTrace explanation={explanation} />);
    expect(screen.getByTestId("trust-trace-receipt")).toHaveTextContent(/Fair/);
  });
});
