import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  resetSpeakerArbiterForTests,
  stopActivePlayback,
  useSpeaker,
  type PlayableLike,
  type SpeakerDeps,
} from "./useSpeaker";

/** A scriptable utterance: play resolves (or rejects) on demand. */
function fakePlayable(options: { blockAutoplay?: boolean } = {}) {
  let endedCallback: (() => void) | null = null;
  const playable = {
    playCount: 0,
    paused: true,
    position: 42, // pretend we're mid-utterance; pause must not reset it
    play: vi.fn(function (this: void) {
      if (options.blockAutoplay && playable.playCount === 0) {
        playable.playCount += 1;
        return Promise.reject(
          Object.assign(new Error("blocked"), { name: "NotAllowedError" }),
        );
      }
      playable.playCount += 1;
      playable.paused = false;
      return Promise.resolve();
    }),
    pause: vi.fn(function (this: void) {
      playable.paused = true; // position is kept — that's the contract
    }),
    seekToStart: vi.fn(function (this: void) {
      playable.position = 0;
    }),
    dispose: vi.fn(),
    onEnded: (callback: () => void) => {
      endedCallback = callback;
    },
    onError: () => {},
    end: () => endedCallback?.(),
  };
  return playable;
}

const depsFor = (playable: PlayableLike): SpeakerDeps => ({
  load: () => Promise.resolve(playable),
});

beforeEach(() => {
  resetSpeakerArbiterForTests();
});

describe("useSpeaker", () => {
  it("loads, plays, pauses keeping position, and resumes", async () => {
    const playable = fakePlayable();
    const { result } = renderHook(() => useSpeaker("hello", depsFor(playable)));
    expect(result.current.state).toBe("idle");

    act(() => result.current.speak());
    await waitFor(() => expect(result.current.state).toBe("playing"));

    act(() => result.current.toggle());
    expect(result.current.state).toBe("paused");
    expect(playable.pause).toHaveBeenCalled();
    expect(playable.position).toBe(42); // never reset on pause

    act(() => result.current.toggle());
    await waitFor(() => expect(result.current.state).toBe("playing"));
    expect(playable.seekToStart).not.toHaveBeenCalled();
  });

  it("replays from the top after the utterance ends", async () => {
    const playable = fakePlayable();
    const { result } = renderHook(() => useSpeaker("hello", depsFor(playable)));
    act(() => result.current.speak());
    await waitFor(() => expect(result.current.state).toBe("playing"));

    act(() => playable.end());
    expect(result.current.state).toBe("ended");

    act(() => result.current.toggle());
    expect(playable.seekToStart).toHaveBeenCalled();
    await waitFor(() => expect(result.current.state).toBe("playing"));
  });

  it("treats a blocked autoplay as paused-and-ready, not an error", async () => {
    const playable = fakePlayable({ blockAutoplay: true });
    const { result } = renderHook(() => useSpeaker("hello", depsFor(playable)));
    act(() => result.current.speak());
    await waitFor(() => expect(result.current.state).toBe("paused"));

    // One tap starts it.
    act(() => result.current.toggle());
    await waitFor(() => expect(result.current.state).toBe("playing"));
  });

  it("surfaces a failed load honestly", async () => {
    const { result } = renderHook(() =>
      useSpeaker("hello", { load: () => Promise.reject(new Error("502")) }),
    );
    act(() => result.current.speak());
    await waitFor(() => expect(result.current.state).toBe("error"));
    // Tapping the error state retries the load.
    const playable = fakePlayable();
    const retry = renderHook(() => useSpeaker("hello", depsFor(playable)));
    act(() => retry.result.current.toggle());
    await waitFor(() => expect(retry.result.current.state).toBe("playing"));
  });

  it("two speakers never talk over each other — the older one pauses, keeping its place", async () => {
    const first = fakePlayable();
    const second = fakePlayable();
    const a = renderHook(() => useSpeaker("answer one", depsFor(first)));
    const b = renderHook(() => useSpeaker("answer two", depsFor(second)));

    act(() => a.result.current.speak());
    await waitFor(() => expect(a.result.current.state).toBe("playing"));

    act(() => b.result.current.speak());
    await waitFor(() => expect(b.result.current.state).toBe("playing"));
    expect(a.result.current.state).toBe("paused");
    expect(first.position).toBe(42); // resumable later

    // Resuming the first pauses the second.
    act(() => a.result.current.toggle());
    await waitFor(() => expect(a.result.current.state).toBe("playing"));
    expect(b.result.current.state).toBe("paused");
  });

  it("stopActivePlayback silences whatever is talking (global mute)", async () => {
    const playable = fakePlayable();
    const { result } = renderHook(() => useSpeaker("hello", depsFor(playable)));
    act(() => result.current.speak());
    await waitFor(() => expect(result.current.state).toBe("playing"));

    act(() => stopActivePlayback());
    expect(result.current.state).toBe("paused");
  });

  it("disposes its audio on unmount", async () => {
    const playable = fakePlayable();
    const hook = renderHook(() => useSpeaker("hello", depsFor(playable)));
    act(() => hook.result.current.speak());
    await waitFor(() => expect(hook.result.current.state).toBe("playing"));
    hook.unmount();
    expect(playable.dispose).toHaveBeenCalled();
  });
});
