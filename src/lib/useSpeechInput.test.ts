import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSpeechInput, type SpeechRecognitionCtor } from "./useSpeechInput";
import { FakeRecognizer } from "./fakeSpeechRecognizer";

function setup(recognitionCtor: SpeechRecognitionCtor | null) {
  FakeRecognizer.reset();
  const onInterim = vi.fn();
  const onFinal = vi.fn();
  const hook = renderHook(() => useSpeechInput({ onInterim, onFinal, recognitionCtor }));
  return { hook, onInterim, onFinal };
}

const fakeCtor = FakeRecognizer as unknown as SpeechRecognitionCtor;

describe("useSpeechInput", () => {
  it("reports unsupported when no constructor exists, and start() is a no-op", () => {
    const { hook, onInterim } = setup(null);
    expect(hook.result.current.state).toEqual({ status: "unsupported" });

    act(() => hook.result.current.start());
    expect(hook.result.current.state).toEqual({ status: "unsupported" });
    expect(FakeRecognizer.instances).toHaveLength(0);
    expect(onInterim).not.toHaveBeenCalled();
  });

  it("is unsupported in this jsdom environment when left to feature-detect", () => {
    const { result } = renderHook(() =>
      useSpeechInput({ onInterim: vi.fn(), onFinal: vi.fn() }),
    );
    expect(result.current.state).toEqual({ status: "unsupported" });
  });

  it("starts listening with interim results on and continuous on", () => {
    const { hook } = setup(fakeCtor);
    expect(hook.result.current.state).toEqual({ status: "idle" });

    act(() => hook.result.current.start());
    expect(hook.result.current.state).toEqual({ status: "listening" });

    const recognizer = FakeRecognizer.last();
    expect(recognizer.started).toBe(true);
    expect(recognizer.interimResults).toBe(true);
    // Continuous + our own silence endpointer: mid-sentence pauses no
    // longer cut the dictation off.
    expect(recognizer.continuous).toBe(true);
    expect(recognizer.lang).not.toBe("");

    // A second start while listening must not spawn a second recognizer.
    act(() => hook.result.current.start());
    expect(FakeRecognizer.instances).toHaveLength(1);
  });

  it("streams interim text, then settles the final text when the session ends", () => {
    const { hook, onInterim, onFinal } = setup(fakeCtor);
    act(() => hook.result.current.start());
    const recognizer = FakeRecognizer.last();

    act(() => recognizer.emitResult("reliable family", false));
    act(() => recognizer.emitResult("reliable family suv", false));
    expect(onInterim).toHaveBeenNthCalledWith(1, "reliable family");
    expect(onInterim).toHaveBeenNthCalledWith(2, "reliable family suv");
    expect(onFinal).not.toHaveBeenCalled();
    expect(hook.result.current.state).toEqual({ status: "listening" });

    // A settled segment mid-session still streams as interim — the
    // dictation is one session, settled once, at the end.
    act(() => recognizer.emitResult(" reliable family SUV under $30k ", true));
    expect(onFinal).not.toHaveBeenCalled();
    expect(onInterim).toHaveBeenLastCalledWith("reliable family SUV under $30k");

    act(() => recognizer.end());
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal).toHaveBeenCalledWith("reliable family SUV under $30k");
    expect(hook.result.current.state).toEqual({ status: "idle" });
  });

  it("settles on its own after a silent pause (the endpointer)", () => {
    vi.useFakeTimers();
    try {
      const { hook, onFinal } = setup(fakeCtor);
      act(() => hook.result.current.start());
      const recognizer = FakeRecognizer.last();

      // Nothing said yet: the endpointer must NOT be armed — the user
      // may click the mic and think first.
      act(() => vi.advanceTimersByTime(5_000));
      expect(hook.result.current.state).toEqual({ status: "listening" });

      act(() => recognizer.emitResult("is december a better month", true));
      act(() => vi.advanceTimersByTime(1_700));
      expect(onFinal).toHaveBeenCalledWith("is december a better month");
      expect(hook.result.current.state).toEqual({ status: "idle" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("stop() settles immediately with what was heard", () => {
    const { hook, onFinal } = setup(fakeCtor);
    act(() => hook.result.current.start());
    const recognizer = FakeRecognizer.last();

    act(() => recognizer.emitResult("under thirty thousand", true));
    act(() => hook.result.current.stop());
    expect(onFinal).toHaveBeenCalledWith("under thirty thousand");
    expect(hook.result.current.state).toEqual({ status: "idle" });
  });

  it("maps a denied microphone to permission-denied and keeps the error visible past end", () => {
    const { hook } = setup(fakeCtor);
    act(() => hook.result.current.start());

    act(() => FakeRecognizer.last().emitError("not-allowed"));
    expect(hook.result.current.state).toEqual({
      status: "error",
      kind: "permission-denied",
    });

    // Retrying from the error state works.
    act(() => hook.result.current.start());
    expect(hook.result.current.state).toEqual({ status: "listening" });
    expect(FakeRecognizer.instances).toHaveLength(2);
  });

  it("maps silence to no-speech", () => {
    const { hook } = setup(fakeCtor);
    act(() => hook.result.current.start());

    act(() => FakeRecognizer.last().emitError("no-speech"));
    expect(hook.result.current.state).toEqual({ status: "error", kind: "no-speech" });
  });

  it("cancel aborts the recognizer, returns to idle, and delivers nothing", () => {
    const { hook, onInterim, onFinal } = setup(fakeCtor);
    act(() => hook.result.current.start());
    const recognizer = FakeRecognizer.last();

    act(() => hook.result.current.cancel());
    expect(recognizer.aborted).toBe(true);
    expect(hook.result.current.state).toEqual({ status: "idle" });

    // Late events from the aborted recognizer must not leak through.
    act(() => recognizer.emitResult("ghost text", true));
    expect(onInterim).not.toHaveBeenCalled();
    expect(onFinal).not.toHaveBeenCalled();
  });

  it("aborts an in-flight dictation on unmount", () => {
    const { hook } = setup(fakeCtor);
    act(() => hook.result.current.start());
    const recognizer = FakeRecognizer.last();

    hook.unmount();
    expect(recognizer.aborted).toBe(true);
  });
});
