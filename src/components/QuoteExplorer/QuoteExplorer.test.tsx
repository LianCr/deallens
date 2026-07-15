import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { quoteMarkerLayout } from "@/components/charts/PriceContextChart/markerLayout";
import { getDealTarget, setDealTarget } from "@/lib/dealTarget";
import { QuoteExplorer } from "./QuoteExplorer";

/** 21 evenly spread prices: median 25,000, deterministic percentiles. */
const samples = Array.from({ length: 21 }, (_, i) => 20_000 + i * 500);

const baseProps = {
  samples,
  initialQuote: 24_500,
  median: 25_000,
  domain: { lo: 20_000, hi: 30_000 },
  vehiclePath: "/deal/honda/2022/civic",
  contactHref: "/contact?vehicle=civic",
};

afterEach(() => {
  setDealTarget(null);
});

describe("QuoteExplorer", () => {
  test("renders the server verdict for the dealer's quote", () => {
    render(<QuoteExplorer {...baseProps} />);
    expect(screen.getByTestId("verdict-hero")).toHaveTextContent("Fair price");
    expect(screen.getByText(/dealer quote/i)).toBeInTheDocument();
    expect(screen.getByText(/\$500 below the median/)).toBeInTheDocument();
  });

  test("dragging the slider reruns the domain math live", () => {
    render(<QuoteExplorer {...baseProps} />);
    const slider = screen.getByLabelText(/drag to explore/i);

    fireEvent.change(slider, { target: { value: "20000" } });
    expect(screen.getByTestId("verdict-hero")).toHaveTextContent("Great deal");
    expect(screen.getByText(/exploring/i)).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: "30000" } });
    expect(screen.getByTestId("verdict-hero")).toHaveTextContent("Above market");
    expect(screen.getByText(/\$5,000 above the median/)).toBeInTheDocument();
  });

  test("the slider is a plain GET form — the no-JS fallback contract", () => {
    render(<QuoteExplorer {...baseProps} />);
    const form = screen.getByTestId("quote-explorer");
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", baseProps.vehiclePath);
    expect(screen.getByLabelText(/drag to explore/i)).toHaveAttribute(
      "name",
      "quote",
    );
    expect(
      screen.getByRole("button", { name: /check this quote/i }),
    ).toBeInTheDocument();
  });

  test("hides the slider when the market is too thin to explore honestly", () => {
    render(
      <QuoteExplorer
        {...baseProps}
        samples={[21_000, 22_000, 23_000]}
        median={null}
        domain={null}
      />,
    );
    expect(screen.getByTestId("verdict-hero")).toHaveTextContent(
      "Not enough data to say",
    );
    expect(screen.queryByTestId("quote-explorer")).not.toBeInTheDocument();
    // Zones and chips honestly disappear with it — no fabricated market.
    expect(screen.queryByTestId("counter-offers")).not.toBeInTheDocument();
  });

  test("colors the track by verdict zone and marks the quartile detents", () => {
    render(<QuoteExplorer {...baseProps} />);
    const slider = screen.getByLabelText(/drag to explore/i);
    // Hard-stop gradient with the P25/P75 stops, as a track custom prop.
    expect(slider.style.getPropertyValue("--zone-track")).toContain("linear-gradient");
    const form = screen.getByTestId("quote-explorer");
    expect(within(form).getByText("P25")).toBeInTheDocument();
    expect(within(form).getByText("median")).toBeInTheDocument();
    expect(within(form).getByText("P75")).toBeInTheDocument();
  });

  test("soft-snaps a drag that lands near a detent", () => {
    render(<QuoteExplorer {...baseProps} />);
    const slider = screen.getByLabelText(/drag to explore/i);
    // 22,400 is within 1.5% of the span of the P25 detent (22,500).
    fireEvent.change(slider, { target: { value: "22400" } });
    expect(slider).toHaveValue("22500");
    expect(screen.getByTestId("verdict-hero")).toHaveTextContent("$22,500");
    // 22,300 is outside the snap radius and stays put.
    fireEvent.change(slider, { target: { value: "22300" } });
    expect(slider).toHaveValue("22300");
  });

  describe("counter-offer chips", () => {
    test("render as real links with values and grounding lines", () => {
      render(<QuoteExplorer {...baseProps} />);
      const chips = screen.getByTestId("counter-offers");

      const aggressive = screen.getByTestId("chip-aggressive");
      expect(aggressive).toHaveAttribute("href", "/deal/honda/2022/civic?quote=22450");
      expect(aggressive).toHaveTextContent("Aggressive $22,450");
      expect(aggressive).toHaveTextContent("1 in 4 comparable listings closed below this");

      expect(screen.getByTestId("chip-balanced")).toHaveAttribute(
        "href",
        "/deal/honda/2022/civic?quote=23950",
      );
      expect(screen.getByTestId("chip-walkaway")).toHaveAttribute(
        "href",
        "/deal/honda/2022/civic?quote=25000",
      );
      expect(within(chips).getAllByRole("link")).toHaveLength(3);
    });

    test("clicking a chip updates the verdict and slider without navigating", () => {
      const replaceState = vi.spyOn(window.history, "replaceState");
      render(<QuoteExplorer {...baseProps} />);

      // fireEvent returns false when the handler prevented the default —
      // i.e. the link did not navigate.
      const navigated = fireEvent.click(screen.getByTestId("chip-aggressive"));
      expect(navigated).toBe(false);

      expect(screen.getByTestId("verdict-hero")).toHaveTextContent("Great deal");
      expect(screen.getByLabelText(/drag to explore/i)).toHaveValue("22450");
      // The URL flushes immediately (no debounce on a deliberate pick)…
      expect(String(replaceState.mock.calls.at(-1)![2])).toContain("quote=22450");
      // …and the target store publishes right away too.
      expect(getDealTarget()).toBe(22_450);
    });
  });

  test("keeps the dealer's quote anchored while exploring", () => {
    render(
      <QuoteExplorer {...baseProps}>
        <svg>
          <g data-quote-origin data-testid="origin" opacity="0" />
          <g data-quote-marker>
            <text data-quote-label />
          </g>
        </svg>
      </QuoteExplorer>,
    );
    const slider = screen.getByLabelText(/drag to explore/i);

    fireEvent.change(slider, { target: { value: "24000" } });
    // The ghost origin marker fades in (opacity only, zero layout shift)…
    expect(screen.getByTestId("origin")).toHaveAttribute("opacity", "0.4");
    // …and the hero frames the difference against the dealer's quote.
    expect(screen.getByTestId("savings-line")).toHaveTextContent(
      "You'd save $500 vs the dealer's quote.",
    );

    fireEvent.change(slider, { target: { value: "25500" } });
    expect(screen.getByTestId("savings-line")).toHaveTextContent(
      "That's $1,000 more than the dealer asked.",
    );

    // Back at the dealer's quote the anchor dissolves.
    fireEvent.change(slider, { target: { value: "24500" } });
    expect(screen.getByTestId("origin")).toHaveAttribute("opacity", "0");
    expect(screen.getByTestId("savings-line")).toHaveTextContent("");
  });

  test("the contact link carries the explored price as an offer", () => {
    render(<QuoteExplorer {...baseProps} />);
    const link = screen.getByRole("link", { name: /contact the dealer/i });
    expect(link).toHaveAttribute("href", "/contact?vehicle=civic");

    fireEvent.change(screen.getByLabelText(/drag to explore/i), {
      target: { value: "24000" },
    });
    expect(link).toHaveAttribute("href", "/contact?vehicle=civic&offer=24000");
  });

  describe("URL sync", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    test("keeps the shareable URL tracking the explored quote, debounced", () => {
      const replaceState = vi.spyOn(window.history, "replaceState");
      render(<QuoteExplorer {...baseProps} />);
      const slider = screen.getByLabelText(/drag to explore/i);

      fireEvent.change(slider, { target: { value: "21000" } });
      fireEvent.change(slider, { target: { value: "20000" } });
      expect(replaceState).not.toHaveBeenCalled();

      vi.advanceTimersByTime(250);
      expect(replaceState).toHaveBeenCalledTimes(1);
      expect(String(replaceState.mock.calls[0]![2])).toContain("quote=20000");
    });

    test("publishes the explored quote to the deal-target store, debounced", () => {
      render(<QuoteExplorer {...baseProps} />);
      const slider = screen.getByLabelText(/drag to explore/i);

      fireEvent.change(slider, { target: { value: "21000" } });
      expect(getDealTarget()).toBeNull();
      vi.advanceTimersByTime(250);
      expect(getDealTarget()).toBe(21_000);

      // Back at the dealer's quote there is no target — actions aim at
      // the real quote again.
      fireEvent.change(slider, { target: { value: "24500" } });
      vi.advanceTimersByTime(250);
      expect(getDealTarget()).toBeNull();
    });

    test("withdraws the target when the explorer unmounts", () => {
      const { unmount } = render(<QuoteExplorer {...baseProps} />);
      fireEvent.change(screen.getByLabelText(/drag to explore/i), {
        target: { value: "21000" },
      });
      vi.advanceTimersByTime(250);
      expect(getDealTarget()).toBe(21_000);
      unmount();
      expect(getDealTarget()).toBeNull();
    });
  });

  test("moves the chart's quote marker by transform only", () => {
    render(
      <QuoteExplorer {...baseProps}>
        <svg>
          <g data-quote-marker data-testid="marker">
            <text data-quote-label data-testid="marker-label">
              your quote $24,500
            </text>
          </g>
          <text data-axis-lo data-testid="axis-lo" />
          <text data-axis-hi data-testid="axis-hi" />
        </svg>
      </QuoteExplorer>,
    );
    const slider = screen.getByLabelText(/drag to explore/i);
    fireEvent.change(slider, { target: { value: "20000" } });

    const from = quoteMarkerLayout(24_500, 20_000, 30_000);
    const to = quoteMarkerLayout(20_000, 20_000, 30_000);
    expect(screen.getByTestId("marker")).toHaveAttribute(
      "transform",
      `translate(${to.x - from.x} 0)`,
    );
    expect(screen.getByTestId("marker-label")).toHaveTextContent(
      "your quote $20,000",
    );
    expect(screen.getByTestId("marker-label")).toHaveAttribute(
      "text-anchor",
      "start",
    );
    // The quote label owns the left corner now; the lo label yields.
    expect(screen.getByTestId("axis-lo")).toHaveAttribute("visibility", "hidden");
    expect(screen.getByTestId("axis-hi")).toHaveAttribute("visibility", "visible");
  });
});
