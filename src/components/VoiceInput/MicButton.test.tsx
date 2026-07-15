import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MicButton } from "./MicButton";
import { FakeRecognizer } from "@/lib/fakeSpeechRecognizer";
import type { SpeechRecognitionCtor } from "@/lib/useSpeechInput";
import type { VoiceRecorderDeps } from "@/lib/useVoiceRecorder";
import { primeSttAvailabilityForTests } from "@/lib/sttAvailability";

const fakeCtor = FakeRecognizer as unknown as SpeechRecognitionCtor;

function renderMic(recognitionCtor: SpeechRecognitionCtor | null) {
  const onInterim = vi.fn();
  const onFinal = vi.fn();
  render(
    <MicButton onInterim={onInterim} onFinal={onFinal} recognitionCtor={recognitionCtor} />,
  );
  return { onInterim, onFinal };
}

/** A scriptable tier-2 recording pipeline with no real browser APIs. */
function fakeRecorderDeps(transcript: string) {
  let resolveTranscribe: (text: string) => void = () => {};
  const recorder = {
    ondataavailable: null as ((event: { data: Blob }) => void) | null,
    onstop: null as (() => void) | null,
    start: vi.fn(),
    stop: vi.fn(function (this: void) {
      recorder.ondataavailable?.({ data: new Blob(["audio"], { type: "audio/webm" }) });
      recorder.onstop?.();
    }),
  };
  const deps: VoiceRecorderDeps = {
    getUserMedia: async () => ({ getTracks: () => [] }),
    createRecorder: () => ({ recorder, mimeType: "audio/webm" }),
    createLevelMeter: () => null,
    transcribe: () =>
      new Promise<string>((resolve) => {
        resolveTranscribe = resolve;
      }),
  };
  return { deps, recorder, finish: () => resolveTranscribe(transcript) };
}

beforeEach(() => {
  FakeRecognizer.reset();
});

describe("MicButton", () => {
  it("renders nothing at all when the API is unsupported — no dead button", () => {
    renderMic(null);
    expect(screen.queryByTestId("mic-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mic-status")).not.toBeInTheDocument();
  });

  it("toggles aria-pressed and the live status while listening", () => {
    renderMic(fakeCtor);
    const button = screen.getByTestId("mic-button");
    expect(button).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("mic-status")).toHaveTextContent("Listening…");

    // Second click settles the dictation — it keeps what was heard
    // (Escape is the discard gesture), so no abort.
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(FakeRecognizer.last().aborted).toBe(false);
    expect(screen.getByTestId("mic-status")).toHaveTextContent("");
  });

  it("discloses that the browser's speech service processes the audio", () => {
    renderMic(fakeCtor);
    expect(screen.getByTestId("mic-button")).toHaveAttribute(
      "title",
      expect.stringContaining("browser's speech service"),
    );
  });

  it("pipes interim and final text to the host callbacks", () => {
    const { onInterim, onFinal } = renderMic(fakeCtor);
    fireEvent.click(screen.getByTestId("mic-button"));

    act(() => FakeRecognizer.last().emitResult("family suv", false));
    expect(onInterim).toHaveBeenCalledWith("family suv");

    act(() => FakeRecognizer.last().emitResult("family SUV under $30k", true));
    act(() => FakeRecognizer.last().end());
    expect(onFinal).toHaveBeenCalledWith("family SUV under $30k");
  });

  it("cycles the dictation language on the toggle", () => {
    renderMic(fakeCtor);
    const toggle = screen.getByTestId("lang-toggle");
    expect(toggle).toHaveTextContent("Auto");
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent("EN");
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent("中文");
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent("Auto");
  });

  describe("server tier (tier 2)", () => {
    it("records, transcribes, and delivers editable text — preferred over the browser tier", async () => {
      primeSttAvailabilityForTests("enabled");
      const { deps, recorder, finish } = fakeRecorderDeps("is december a better month");
      const onFinal = vi.fn();
      render(
        <MicButton
          onInterim={vi.fn()}
          onFinal={onFinal}
          recognitionCtor={fakeCtor}
          recorderDeps={deps}
        />,
      );

      const button = screen.getByTestId("mic-button");
      expect(button).toHaveAttribute(
        "title",
        expect.stringContaining("deployment's speech service"),
      );

      fireEvent.click(button);
      await waitFor(() =>
        expect(screen.getByTestId("mic-status")).toHaveTextContent("Recording"),
      );
      // The server tier won the click; Web Speech never started.
      expect(FakeRecognizer.instances).toHaveLength(0);

      fireEvent.click(button); // stop → transcribe
      expect(recorder.stop).toHaveBeenCalled();
      await waitFor(() =>
        expect(screen.getByTestId("mic-status")).toHaveTextContent("Transcribing…"),
      );

      act(() => finish());
      await waitFor(() =>
        expect(onFinal).toHaveBeenCalledWith("is december a better month"),
      );
      expect(screen.getByTestId("mic-button")).toHaveAttribute("aria-pressed", "false");
    });

    it("renders on browsers without Web Speech when the server tier is enabled", () => {
      primeSttAvailabilityForTests("enabled");
      const { deps } = fakeRecorderDeps("hello");
      render(
        <MicButton
          onInterim={vi.fn()}
          onFinal={vi.fn()}
          recognitionCtor={null}
          recorderDeps={deps}
        />,
      );
      expect(screen.getByTestId("mic-button")).toBeInTheDocument();
    });

    it("stays hidden without Web Speech when the server tier is disabled", () => {
      const { deps } = fakeRecorderDeps("hello");
      render(
        <MicButton
          onInterim={vi.fn()}
          onFinal={vi.fn()}
          recognitionCtor={null}
          recorderDeps={deps}
        />,
      );
      expect(screen.queryByTestId("mic-button")).not.toBeInTheDocument();
    });
  });

  it("cancels on Escape from anywhere in the document", () => {
    renderMic(fakeCtor);
    fireEvent.click(screen.getByTestId("mic-button"));
    expect(screen.getByTestId("mic-button")).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByTestId("mic-button")).toHaveAttribute("aria-pressed", "false");
    expect(FakeRecognizer.last().aborted).toBe(true);
  });

  it("shows honest error copy when the microphone is denied or hears nothing", () => {
    renderMic(fakeCtor);
    fireEvent.click(screen.getByTestId("mic-button"));
    act(() => FakeRecognizer.last().emitError("not-allowed"));
    expect(screen.getByTestId("mic-status")).toHaveTextContent(
      "Microphone access was denied — typing still works.",
    );

    fireEvent.click(screen.getByTestId("mic-button"));
    act(() => FakeRecognizer.last().emitError("no-speech"));
    expect(screen.getByTestId("mic-status")).toHaveTextContent(
      "Didn't catch anything — try again, or keep typing.",
    );
  });
});
