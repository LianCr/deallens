import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FunFact } from "./FunFact";
import { primeTtsAvailabilityForTests } from "@/lib/ttsAvailability";
import { resetSpeakerArbiterForTests, type SpeakerDeps } from "@/lib/useSpeaker";

const props = { make: "honda", year: 2022, model: "civic" };

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

beforeEach(() => {
  resetSpeakerArbiterForTests();
  vi.unstubAllGlobals();
});

describe("FunFact", () => {
  it("hides the story behind the hook — nothing fetched until tapped", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<FunFact {...props} />);
    expect(
      screen.getByRole("button", { name: /what makes this car special/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("fun-fact-card")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("streams the story in and offers a manual storyteller voice — no autoplay", async () => {
    primeTtsAvailabilityForTests("enabled");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamResponse(["The 11th-gen Civic hides ", "a single die-cast mesh."]),
      ),
    );
    const playable = {
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      seekToStart: vi.fn(),
      dispose: vi.fn(),
      onEnded: vi.fn(),
      onError: vi.fn(),
    };
    const speakerDeps: SpeakerDeps = { load: vi.fn().mockResolvedValue(playable) };
    render(<FunFact {...props} speakerDeps={speakerDeps} />);

    fireEvent.click(screen.getByTestId("fun-fact-reveal"));
    await waitFor(() =>
      expect(screen.getByTestId("fun-fact-card")).toHaveTextContent(
        "The 11th-gen Civic hides a single die-cast mesh.",
      ),
    );

    // The speaker is there but silent until asked — the tap IS the surprise.
    const speaker = screen.getByTestId("speaker-button");
    expect(playable.play).not.toHaveBeenCalled();
    fireEvent.click(speaker);
    await waitFor(() => expect(playable.play).toHaveBeenCalledTimes(1));
  });

  it("tells the no-key truth without a dead retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ reason: "no-key", message: "no key" }, { status: 503 }),
      ),
    );
    render(<FunFact {...props} />);
    fireEvent.click(screen.getByTestId("fun-fact-reveal"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("no storyteller today"),
    );
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });
});
