import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FakeRecognizer } from "@/lib/fakeSpeechRecognizer";
import type { SpeechRecognitionCtor } from "@/lib/useSpeechInput";
import { primeTtsAvailabilityForTests } from "@/lib/ttsAvailability";
import { setVoicePref } from "@/lib/voicePref";
import { resetSpeakerArbiterForTests, type SpeakerDeps } from "@/lib/useSpeaker";
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

  describe("voice replies", () => {
    function fakeSpeaker() {
      const playable = {
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        seekToStart: vi.fn(),
        dispose: vi.fn(),
        onEnded: vi.fn(),
        onError: vi.fn(),
      };
      const deps: SpeakerDeps = { load: vi.fn().mockResolvedValue(playable) };
      return { deps, playable };
    }

    beforeEach(() => {
      primeTtsAvailabilityForTests("enabled");
      resetSpeakerArbiterForTests();
      // jsdom localStorage persists across tests in a file; pin the pref.
      setVoicePref(true);
    });

    it("the newest answer speaks on its own when voice replies are on", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(streamResponse(["Grounded answer."])),
      );
      const { deps, playable } = fakeSpeaker();
      render(<AskThread {...props} speakerDeps={deps} />);

      ask("Is this the right month to buy?");
      await waitFor(() => expect(screen.getByTestId("ask-answer")).toBeInTheDocument());
      await waitFor(() => expect(playable.play).toHaveBeenCalledTimes(1));
      expect(deps.load).toHaveBeenCalledWith("Grounded answer.");
      expect(screen.getByTestId("speaker-button")).toHaveAttribute(
        "data-state",
        "playing",
      );
    });

    it("stays silent when voice replies are muted — manual play still available", async () => {
      setVoicePref(false);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(streamResponse(["Grounded answer."])),
      );
      const { deps, playable } = fakeSpeaker();
      render(<AskThread {...props} speakerDeps={deps} />);

      const toggle = screen.getByTestId("voice-replies-toggle");
      expect(toggle).toHaveAttribute("aria-pressed", "false");

      ask("Is this the right month to buy?");
      await waitFor(() => expect(screen.getByTestId("ask-answer")).toBeInTheDocument());
      expect(playable.play).not.toHaveBeenCalled();

      // The bubble's speaker still plays on demand.
      fireEvent.click(screen.getByTestId("speaker-button"));
      await waitFor(() => expect(playable.play).toHaveBeenCalledTimes(1));
    });

    it("muting mid-playback silences the current answer", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(streamResponse(["Grounded answer."])),
      );
      const { deps, playable } = fakeSpeaker();
      render(<AskThread {...props} speakerDeps={deps} />);

      ask("Is this the right month to buy?");
      await waitFor(() => expect(playable.play).toHaveBeenCalled());

      fireEvent.click(screen.getByTestId("voice-replies-toggle"));
      expect(playable.pause).toHaveBeenCalled();
      expect(screen.getByTestId("speaker-button")).toHaveAttribute(
        "data-state",
        "paused",
      );
    });
  });

  describe("voice input", () => {
    const fakeCtor = FakeRecognizer as unknown as SpeechRecognitionCtor;

    beforeEach(() => {
      FakeRecognizer.reset();
    });

    it("hides the mic entirely when the browser lacks the Web Speech API", () => {
      render(<AskThread {...props} speechRecognitionCtor={null} />);
      expect(screen.queryByTestId("mic-button")).not.toBeInTheDocument();
      // The mount point still exists (and collapses via :empty).
      expect(screen.getByTestId("ask-input-accessory")).toBeEmptyDOMElement();
    });

    it("streams interim text muted, leaves the final text editable, and never auto-asks", async () => {
      const fetchMock = vi.fn().mockResolvedValue(streamResponse(["Grounded answer."]));
      vi.stubGlobal("fetch", fetchMock);
      render(<AskThread {...props} speechRecognitionCtor={fakeCtor} />);

      fireEvent.click(screen.getByTestId("mic-button"));
      const input = screen.getByLabelText("Ask about this deal");

      // Interim: streams into the input, visually marked as provisional.
      act(() => FakeRecognizer.last().emitResult("is this the right", false));
      expect(input).toHaveValue("is this the right");
      expect(input.className).toContain("inputInterim");

      // Final: settles, muting removed — and crucially, no fetch fired.
      act(() => FakeRecognizer.last().emitResult("is this the right month to buy?", true));
      act(() => FakeRecognizer.last().end());
      expect(input).toHaveValue("is this the right month to buy?");
      expect(input.className).not.toContain("inputInterim");
      expect(fetchMock).not.toHaveBeenCalled();

      // The heard text stays editable, and asking is manual.
      fireEvent.change(input, { target: { value: "is December a better month?" } });
      fireEvent.click(screen.getByRole("button", { name: "Ask" }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(String(fetchMock.mock.calls[0]![1]!.body)).toContain(
        "is December a better month?",
      );
    });
  });
});
