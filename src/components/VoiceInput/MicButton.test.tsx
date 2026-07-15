import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MicButton } from "./MicButton";
import { FakeRecognizer } from "@/lib/fakeSpeechRecognizer";
import type { SpeechRecognitionCtor } from "@/lib/useSpeechInput";

const fakeCtor = FakeRecognizer as unknown as SpeechRecognitionCtor;

function renderMic(recognitionCtor: SpeechRecognitionCtor | null) {
  const onInterim = vi.fn();
  const onFinal = vi.fn();
  render(
    <MicButton onInterim={onInterim} onFinal={onFinal} recognitionCtor={recognitionCtor} />,
  );
  return { onInterim, onFinal };
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

    // Second click cancels.
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(FakeRecognizer.last().aborted).toBe(true);
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
    expect(onFinal).toHaveBeenCalledWith("family SUV under $30k");
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
