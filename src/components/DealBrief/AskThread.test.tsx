import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AskThread } from "./AskThread";

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

function ask(question: string) {
  fireEvent.change(screen.getByLabelText("Ask about this deal"), {
    target: { value: question },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AskThread", () => {
  it("streams an answer into a bubble labeled with the AI badge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamResponse(["The quote sits near ", "the demo market median."]),
      ),
    );
    render(<AskThread {...props} />);
    ask("Is this a fair price?");

    // The question echoes immediately; the answer streams in.
    expect(screen.getByText("Is this a fair price?")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText(/the quote sits near the demo market median/i),
      ).toBeInTheDocument(),
    );
    const answer = await screen.findByTestId("ask-answer");
    expect(answer).toHaveTextContent(/AI-generated · grounded/);
    // Ready for the next question.
    expect(screen.getByLabelText("Ask about this deal")).toHaveValue("");
  });

  it("replays prior turns (bounded) on the next question", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(streamResponse(["First answer."]))
      .mockResolvedValueOnce(streamResponse(["Second answer."]));
    vi.stubGlobal("fetch", fetchMock);
    render(<AskThread {...props} />);

    ask("First question?");
    await waitFor(() => expect(screen.getByText("First answer.")).toBeInTheDocument());

    ask("Second question?");
    await waitFor(() => expect(screen.getByText("Second answer.")).toBeInTheDocument());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(firstBody).toMatchObject({ ...props, question: "First question?", turns: [] });
    const secondBody = JSON.parse(fetchMock.mock.calls[1]![1]!.body as string);
    expect(secondBody.turns).toEqual([{ q: "First question?", a: "First answer." }]);
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
    render(<AskThread {...props} />);
    ask("Is this a fair price?");

    await waitFor(() => expect(screen.getByText(/AI is resting/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    // The form stays available — a later retry can succeed.
    expect(screen.getByLabelText("Ask about this deal")).toBeInTheDocument();
  });

  it("renders the bring-your-own-key card on a 503 no-key response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ reason: "no-key", message: "no key" }, { status: 503 }),
      ),
    );
    render(<AskThread {...props} />);
    ask("Is this a fair price?");

    await waitFor(() => expect(screen.getByTestId("byok-card")).toBeInTheDocument());
    // No retry, no form: asking again without a key can't succeed.
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Ask about this deal")).not.toBeInTheDocument();
  });

  it("keeps a sibling slot next to the input for a future mic button", () => {
    render(<AskThread {...props} inputAccessory={<button type="button">Mic</button>} />);
    const slot = screen.getByTestId("ask-input-accessory");
    expect(slot).toContainElement(screen.getByRole("button", { name: "Mic" }));
    // The slot is a sibling of the input inside the same row.
    expect(slot.parentElement).toContainElement(
      screen.getByLabelText("Ask about this deal"),
    );
  });
});
