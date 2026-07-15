import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SpeakerButton } from "./SpeakerButton";
import { primeTtsAvailabilityForTests } from "@/lib/ttsAvailability";
import { resetSpeakerArbiterForTests, type SpeakerDeps } from "@/lib/useSpeaker";

function fakeDeps() {
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
  resetSpeakerArbiterForTests();
});

describe("SpeakerButton", () => {
  it("renders nothing when the deployment has no speech model", () => {
    // vitest.setup pins availability to "disabled" by default.
    const { deps } = fakeDeps();
    render(<SpeakerButton text="hello" deps={deps} />);
    expect(screen.queryByTestId("speaker-button")).not.toBeInTheDocument();
  });

  it("plays on tap, pauses on the next tap, resumes on the third", async () => {
    primeTtsAvailabilityForTests("enabled");
    const { deps, playable } = fakeDeps();
    render(<SpeakerButton text="hello" deps={deps} />);

    const button = screen.getByTestId("speaker-button");
    expect(button).toHaveAttribute("data-state", "idle");
    expect(button).toHaveAccessibleName("Play voice reply");

    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute("data-state", "playing"));
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(deps.load).toHaveBeenCalledWith("hello");

    fireEvent.click(button);
    expect(button).toHaveAttribute("data-state", "paused");
    expect(button).toHaveAccessibleName("Resume voice reply");
    expect(playable.pause).toHaveBeenCalled();

    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute("data-state", "playing"));
    // Resume, not replay: only one load, no seek.
    expect(deps.load).toHaveBeenCalledTimes(1);
    expect(playable.seekToStart).not.toHaveBeenCalled();
  });

  it("autoPlay speaks on mount — exactly once", async () => {
    primeTtsAvailabilityForTests("enabled");
    const { deps } = fakeDeps();
    const { rerender } = render(<SpeakerButton text="hello" autoPlay deps={deps} />);
    await waitFor(() =>
      expect(screen.getByTestId("speaker-button")).toHaveAttribute(
        "data-state",
        "playing",
      ),
    );
    rerender(<SpeakerButton text="hello" autoPlay deps={deps} />);
    expect(deps.load).toHaveBeenCalledTimes(1);
  });

  it("shows honest copy when the voice can't load — the text stays the answer", async () => {
    primeTtsAvailabilityForTests("enabled");
    const deps: SpeakerDeps = { load: vi.fn().mockRejectedValue(new Error("502")) };
    render(<SpeakerButton text="hello" deps={deps} />);
    fireEvent.click(screen.getByTestId("speaker-button"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Couldn't load the voice — the text above is the answer.",
      ),
    );
  });
});
