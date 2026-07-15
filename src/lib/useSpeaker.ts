"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice-reply playback: one utterance, one state machine.
 *
 *   idle → loading → playing ⇄ paused → ended (tap = replay)
 *                       ↘ error
 *
 * Pause/resume is delegated to the browser's own <audio> element —
 * `pause()` keeps `currentTime`, so "resume exactly where it stopped"
 * costs zero bookkeeping. A module-level arbiter guarantees only one
 * utterance plays at a time: starting or resuming any speaker pauses
 * whichever other one was talking (its position is kept, so tapping it
 * later picks up where it left off).
 *
 * The loader is injectable (same seam pattern as useSpeechInput /
 * useVoiceRecorder) so unit tests drive every transition without
 * fetch, Audio, or object URLs.
 */

export type SpeakerState =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "ended"
  | "error";

/** The slice of a loaded utterance the hook drives (fakes implement it). */
export interface PlayableLike {
  play(): Promise<void>;
  pause(): void;
  seekToStart(): void;
  /** Release resources (object URLs); the playable is dead afterwards. */
  dispose(): void;
  onEnded(callback: () => void): void;
  onError(callback: () => void): void;
}

export interface SpeakerDeps {
  load(text: string): Promise<PlayableLike>;
}

/** Only one voice at a time, across every speaker button on the page. */
interface PlaybackHandle {
  pauseFromArbiter(): void;
}
let activeHandle: PlaybackHandle | null = null;

function claimPlayback(handle: PlaybackHandle): void {
  if (activeHandle && activeHandle !== handle) activeHandle.pauseFromArbiter();
  activeHandle = handle;
}

function releasePlayback(handle: PlaybackHandle): void {
  if (activeHandle === handle) activeHandle = null;
}

/** Silence whatever is currently talking (global mute, page navigation). */
export function stopActivePlayback(): void {
  activeHandle?.pauseFromArbiter();
  activeHandle = null;
}

export function resetSpeakerArbiterForTests(): void {
  activeHandle = null;
}

/** Delivery styles /api/speak knows how to voice. */
export type VoiceStyle = "coach" | "storyteller";

/** The real loader: /api/speak → blob → object URL → <audio>. */
function realDeps(style: VoiceStyle): SpeakerDeps {
  return {
    async load(text) {
      const response = await fetch("/api/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, style }),
      });
      if (!response.ok) throw new Error("speak-failed");
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      return {
        play: () => audio.play(),
        pause: () => audio.pause(),
        seekToStart: () => {
          audio.currentTime = 0;
        },
        dispose: () => {
          audio.pause();
          URL.revokeObjectURL(url);
        },
        onEnded: (callback) => {
          audio.onended = callback;
        },
        onError: (callback) => {
          audio.onerror = callback;
        },
      };
    },
  };
}

export interface Speaker {
  state: SpeakerState;
  /**
   * The one-button contract: idle/error → load & play; playing →
   * pause; paused → resume from where it stopped; ended → replay.
   */
  toggle: () => void;
  /** Load and play from the top (auto-speak entry point). */
  speak: () => void;
}

export function useSpeaker(
  text: string,
  deps?: SpeakerDeps | null,
  style: VoiceStyle = "coach",
): Speaker {
  const [state, setState] = useState<SpeakerState>("idle");
  const playableRef = useRef<PlayableLike | null>(null);
  // Stale-async guard: bumping the session invalidates in-flight loads.
  const sessionRef = useRef(0);
  // The arbiter handle is identity-stable for the hook's lifetime; a
  // lazy state initializer creates it exactly once without a
  // ref-write-in-render.
  const [handle] = useState<PlaybackHandle>(() => ({
    pauseFromArbiter() {
      playableRef.current?.pause();
      setState((current) => (current === "playing" ? "paused" : current));
    },
  }));

  const startPlayback = useCallback(
    (playable: PlayableLike) => {
      claimPlayback(handle);
      playable.play().then(
        () => setState("playing"),
        (cause: unknown) => {
          // Autoplay blocked by the browser: the audio is loaded and one
          // tap starts it — a paused state, never an error.
          if ((cause as { name?: string } | null)?.name === "NotAllowedError") {
            setState("paused");
          } else {
            setState("error");
          }
        },
      );
    },
    [handle],
  );

  const speak = useCallback(() => {
    const active = deps ?? realDeps(style);
    const session = ++sessionRef.current;
    playableRef.current?.dispose();
    playableRef.current = null;
    setState("loading");
    active.load(text).then(
      (playable) => {
        if (sessionRef.current !== session) {
          playable.dispose();
          return;
        }
        playable.onEnded(() => {
          releasePlayback(handle);
          setState("ended");
        });
        playable.onError(() => setState("error"));
        playableRef.current = playable;
        startPlayback(playable);
      },
      () => {
        if (sessionRef.current === session) setState("error");
      },
    );
  }, [deps, text, style, handle, startPlayback]);

  const toggle = useCallback(() => {
    const playable = playableRef.current;
    switch (state) {
      case "playing":
        playable?.pause();
        releasePlayback(handle);
        setState("paused");
        return;
      case "paused":
        if (playable) startPlayback(playable);
        else speak();
        return;
      case "ended":
        if (playable) {
          playable.seekToStart();
          startPlayback(playable);
        } else {
          speak();
        }
        return;
      case "loading":
        return; // one thing at a time
      default:
        speak(); // idle or error → (re)load
    }
  }, [state, handle, speak, startPlayback]);

  // Unmount: silence and release everything this speaker owns.
  useEffect(
    () => () => {
      sessionRef.current += 1;
      releasePlayback(handle);
      playableRef.current?.dispose();
      playableRef.current = null;
    },
    [handle],
  );

  return { state, toggle, speak };
}
