import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NlFinder } from "./NlFinder";

function submitQuery(query: string) {
  fireEvent.change(screen.getByTestId("nl-finder-input"), { target: { value: query } });
  fireEvent.click(screen.getByRole("button", { name: /find candidates/i }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NlFinder", () => {
  it("renders verified candidates as deep-link cards with the honesty line", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          candidates: [
            {
              make: "Honda",
              year: 2022,
              model: "CR-V",
              reason: "Roomy and reliable.",
              href: "/deal/honda/2022/cr-v",
            },
          ],
          dropped: 1,
        }),
      ),
    );
    render(<NlFinder />);
    submitQuery("reliable family SUV under $30k");

    const card = await screen.findByTestId("nl-finder-card");
    expect(card).toHaveAttribute("href", "/deal/honda/2022/cr-v");
    expect(screen.getByText("2022 Honda CR-V")).toBeInTheDocument();
    expect(screen.getByText(/verified against the NHTSA catalog/i)).toBeInTheDocument();
    expect(screen.getByText(/1 suggestion didn't exist there and was dropped/i)).toBeInTheDocument();
  });

  it("shows the honest empty state when nothing survives verification", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ candidates: [], dropped: 3 })),
    );
    render(<NlFinder />);
    submitQuery("a flying car");

    await waitFor(() =>
      expect(screen.getByText(/we won't guess/i)).toBeInTheDocument(),
    );
  });

  it("explains the no-key deployment state without breaking the page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ reason: "no-key", message: "no key" }, { status: 503 }),
      ),
    );
    render(<NlFinder />);
    submitQuery("family SUV");

    await waitFor(() =>
      expect(screen.getByText(/AI search is off on this deployment/i)).toBeInTheDocument(),
    );
  });

  it("surfaces the rate-limit message from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { reason: "ip-minute", message: "Easy there — try again shortly." },
          { status: 429 },
        ),
      ),
    );
    render(<NlFinder />);
    submitQuery("family SUV");

    await waitFor(() =>
      expect(screen.getByText(/easy there/i)).toBeInTheDocument(),
    );
  });

  it("does not submit queries shorter than three characters", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<NlFinder />);
    submitQuery("ok");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
