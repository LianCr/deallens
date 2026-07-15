import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { setDealTarget } from "@/lib/dealTarget";
import { AiBadge, DealBrief } from "./DealBrief";

const props = { make: "honda", year: 2022, model: "civic", quote: 24500 };

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  setDealTarget(null);
});

describe("DealBrief", () => {
  it("streams the brief into place and formats bold headings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamResponse([
          "**What the numbers say**\nMiddle of the market.\n\n",
          "**How to negotiate**\nAnchor on the median.",
        ]),
      ),
    );
    render(<DealBrief {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /draft my negotiation brief/i }));

    await waitFor(() =>
      expect(screen.getByText("What the numbers say")).toBeInTheDocument(),
    );
    expect(screen.getByText(/anchor on the median/i)).toBeInTheDocument();
    // Finished: the trigger button is gone, output is pinned.
    expect(
      screen.queryByRole("button", { name: /draft my negotiation brief/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the bring-your-own-key card on a 503 no-key response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ reason: "no-key", message: "no key" }, { status: 503 }),
      ),
    );
    render(<DealBrief {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /draft my negotiation brief/i }));

    await waitFor(() => expect(screen.getByTestId("byok-card")).toBeInTheDocument());
    expect(screen.getByText(/bring your own key/i)).toBeInTheDocument();
    // No retry button: retrying without a key can't succeed.
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  it("shows the honest rate-limit message and offers a retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { reason: "global-day", message: "AI is resting — daily demo budget reached." },
          { status: 429 },
        ),
      ),
    );
    render(<DealBrief {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /draft my negotiation brief/i }));

    await waitFor(() =>
      expect(screen.getByText(/AI is resting/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("targets the explored price: button copy and request body follow the store", async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse(["**Your target**\nok"]));
    vi.stubGlobal("fetch", fetchMock);
    setDealTarget(23950);
    render(<DealBrief {...props} />);

    const button = screen.getByRole("button", {
      name: /draft a brief to negotiate toward \$23,950/i,
    });
    fireEvent.click(button);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body).toMatchObject({ ...props, target: 23950 });
  });

  it("ignores a target equal to the dealer's quote — nothing to negotiate toward", async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse(["ok"]));
    vi.stubGlobal("fetch", fetchMock);
    setDealTarget(props.quote);
    render(<DealBrief {...props} />);

    const button = screen.getByRole("button", { name: /draft my negotiation brief/i });
    fireEvent.click(button);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body).toEqual(props);
  });

  it("always shows the grounding disclaimer", () => {
    render(<DealBrief {...props} />);
    expect(
      screen.getByText(/AI narrates, math decides/i),
    ).toBeInTheDocument();
  });
});

describe("AiBadge", () => {
  it("labels AI output as grounded", () => {
    render(<AiBadge />);
    expect(screen.getByText(/AI-generated · grounded/i)).toBeInTheDocument();
  });
});
