import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { PricePoint } from "@/domain/types";
import { WhenToBuy } from "./WhenToBuy";

/** 12 consecutive months with a clear December dip. */
const seasonalHistory: PricePoint[] = Array.from({ length: 12 }, (_, i) => ({
  month: `2025-${String(i + 1).padStart(2, "0")}`,
  price: i === 11 ? 18_000 : 20_000,
}));

describe("WhenToBuy", () => {
  test("names the cheapest month and its percentage below average", () => {
    render(<WhenToBuy history={seasonalHistory} />);
    const hint = screen.getByTestId("when-to-buy");
    expect(hint).toHaveTextContent(/prices have dipped lowest in December/);
    // (20000*11 + 18000)/12 = 19833.33; (19833.33-18000)/19833.33 = 9.2%.
    expect(hint).toHaveTextContent(/9\.2% below/);
    expect(hint).toHaveTextContent(/the year's average/);
  });

  test("renders nothing at all for thin history — absence is the honest state", () => {
    const { container } = render(<WhenToBuy history={seasonalHistory.slice(0, 3)} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("when-to-buy")).not.toBeInTheDocument();
  });

  test("renders nothing when the dip is noise (flat market)", () => {
    const flat = seasonalHistory.map((p) => ({ ...p, price: 20_000 }));
    const { container } = render(<WhenToBuy history={flat} />);
    expect(container).toBeEmptyDOMElement();
  });
});
