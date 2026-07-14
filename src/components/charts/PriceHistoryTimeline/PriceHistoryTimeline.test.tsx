import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { MarketEvent, PricePoint } from "@/domain/types";
import { StaticTimeline } from "./StaticTimeline";
import { PriceHistoryTimeline } from "./index";

const history: PricePoint[] = Array.from({ length: 24 }, (_, i) => ({
  month: `${2024 + Math.floor((7 + i) / 12)}-${String(((7 + i) % 12) + 1).padStart(2, "0")}`,
  price: 28000 + i * 50,
}));

const events: MarketEvent[] = [
  { month: history[9]!.month, title: "New model year arrives", kind: "MODEL_YEAR" },
];

describe("PriceHistoryTimeline", () => {
  test("honest empty state below two points of history", () => {
    render(<PriceHistoryTimeline history={history.slice(0, 1)} events={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      /not enough price history to draw an honest chart/i,
    );
  });
});

describe("StaticTimeline (the SSR skeleton)", () => {
  test("renders the full chart without any client JS: svg, header price, delta", () => {
    render(<StaticTimeline history={history} events={events} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/price history/i);
    expect(screen.getByRole("img")).toHaveAccessibleName(/1 market event/i);
    // Latest price appears in the header.
    expect(screen.getByText(`$${history.at(-1)!.price.toLocaleString("en-US")}`)).toBeInTheDocument();
  });

  test("tells no-JS readers what the markers are", () => {
    render(<StaticTimeline history={history} events={events} />);
    expect(screen.getByText(/market-event markers/i)).toBeInTheDocument();
  });
});
