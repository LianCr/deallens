import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { PriceBucket } from "@/domain/types";
import { PriceContextChart } from "./index";

const buckets: PriceBucket[] = [
  { lo: 20000, hi: 22000, count: 8 },
  { lo: 22000, hi: 24000, count: 20 },
  { lo: 24000, hi: 26000, count: 9 },
];

describe("PriceContextChart", () => {
  test("renders the full SVG server-side: quote, median, quartile band", () => {
    render(
      <PriceContextChart
        buckets={buckets}
        quote={21500}
        p25={22000}
        median={23000}
        p75={24000}
      />,
    );
    const svg = screen.getByRole("img");
    expect(svg).toHaveAccessibleName(/quote of \$21,500/i);
    expect(svg).toHaveAccessibleName(/median of \$23,000/i);
  });

  test("ships an invisible origin ghost marker for the explorer to reveal", () => {
    const { container } = render(
      <PriceContextChart
        buckets={buckets}
        quote={21500}
        p25={22000}
        median={23000}
        p75={24000}
      />,
    );
    const ghost = container.querySelector("[data-quote-origin]");
    expect(ghost).not.toBeNull();
    // Hidden by default: it only appears (opacity mutation, zero layout
    // shift) once the QuoteExplorer island explores a different quote.
    expect(ghost).toHaveAttribute("opacity", "0");
    expect(ghost).toHaveAttribute("aria-hidden", "true");
  });

  test("honest empty state when the market is too thin", () => {
    render(
      <PriceContextChart buckets={[]} quote={21500} p25={null} median={null} p75={null} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/won't guess/i);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  test("missing quartiles also degrade to the empty state, never a broken chart", () => {
    render(
      <PriceContextChart
        buckets={buckets}
        quote={21500}
        p25={null}
        median={null}
        p75={null}
      />,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
