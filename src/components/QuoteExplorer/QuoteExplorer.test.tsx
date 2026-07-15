import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { quoteMarkerLayout } from "@/components/charts/PriceContextChart/markerLayout";
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
