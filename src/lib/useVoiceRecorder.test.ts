import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  MAX_RECORDING_BYTES,
  useVoiceRecorder,
  type MediaRecorderLike,
  type VoiceRecorderDeps,
} from "./useVoiceRecorder";

interface Rig {
  deps: VoiceRecorderDeps;
  recorder: MediaRecorderLike & { started: boolean };
  tracks: Array<{ stop: ReturnType<typeof vi.fn> }>;
  transcribe: ReturnType<typeof vi.fn>;
  emitChunk: (bytes: number) => void;
}

function rig(overrides: Partial<VoiceRecorderDeps> = {}): Rig {
  const tracks = [{ stop: vi.fn() }];
  const recorder = {
    started: false,
    ondataavailable: null as ((event: { data: Blob }) => void) | null,
    onstop: null as (() => void) | null,
    start() {
      this.started = true;
    },
    stop() {
      this.onstop?.();
    },
  };
  const transcribe = vi.fn().mockResolvedValue("transcribed text");
  const deps: VoiceRecorderDeps = {
    getUserMedia: async () => ({ getTracks: () => tracks }),
    createRecorder: () => ({ recorder, mimeType: "audio/webm" }),
    createLevelMeter: () => null,
    transcribe,
    ...overrides,
  };
  return {
    deps,
    recorder,
    tracks,
    transcribe,
    emitChunk: (bytes) =>
      recorder.ondataavailable?.({
        data: new Blob([new Uint8Array(bytes)], { type: "audio/webm" }),
      }),
  };
}

describe("useVoiceRecorder", () => {
  it("is unsupported when deps are forced null (and in bare jsdom)", () => {
    const { result } = renderHook(() =>
      useVoiceRecorder({ onFinal: vi.fn(), lang: "en-US", deps: null }),
    );
    expect(result.current.state).toEqual({ status: "unsupported" });

    const bare = renderHook(() => useVoiceRecorder({ onFinal: vi.fn(), lang: "en-US" }));
    expect(bare.result.current.state).toEqual({ status: "unsupported" });
  });

  it("records → transcribes → delivers the text and releases the mic", async () => {
    const r = rig();
    const onFinal = vi.fn();
    const { result } = renderHook(() =>
      useVoiceRecorder({ onFinal, lang: "zh-CN", deps: r.deps }),
    );

    act(() => result.current.start());
    await waitFor(() => expect(result.current.state).toEqual({ status: "recording" }));
    expect(r.recorder.started).toBe(true);

    r.emitChunk(64);
    act(() => result.current.stop());
    await waitFor(() => expect(onFinal).toHaveBeenCalledWith("transcribed text"));
    expect(result.current.state).toEqual({ status: "idle" });
    // The language hint reached the transcriber; the mic was released.
    expect(r.transcribe).toHaveBeenCalledWith(expect.any(Blob), "zh-CN");
    expect(r.tracks[0]!.stop).toHaveBeenCalled();
  });

  it("maps a denied microphone to permission-denied", async () => {
    const r = rig({ getUserMedia: () => Promise.reject(new Error("denied")) });
    const { result } = renderHook(() =>
      useVoiceRecorder({ onFinal: vi.fn(), lang: "en-US", deps: r.deps }),
    );
    act(() => result.current.start());
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "error", kind: "permission-denied" }),
    );
  });

  it("rejects an over-long recording without uploading it", async () => {
    const r = rig();
    const onFinal = vi.fn();
    const { result } = renderHook(() =>
      useVoiceRecorder({ onFinal, lang: "en-US", deps: r.deps }),
    );
    act(() => result.current.start());
    await waitFor(() => expect(result.current.state).toEqual({ status: "recording" }));

    r.emitChunk(MAX_RECORDING_BYTES + 1);
    act(() => result.current.stop());
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "error", kind: "too-long" }),
    );
    expect(r.transcribe).not.toHaveBeenCalled();
    expect(onFinal).not.toHaveBeenCalled();
  });

  it("surfaces a failed transcription honestly", async () => {
    const r = rig({ transcribe: vi.fn().mockRejectedValue(new Error("upstream")) });
    const { result } = renderHook(() =>
      useVoiceRecorder({ onFinal: vi.fn(), lang: "en-US", deps: r.deps }),
    );
    act(() => result.current.start());
    await waitFor(() => expect(result.current.state).toEqual({ status: "recording" }));

    r.emitChunk(64);
    act(() => result.current.stop());
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "error", kind: "transcribe-failed" }),
    );
  });

  it("cancel discards the recording — nothing is uploaded", async () => {
    const r = rig();
    const onFinal = vi.fn();
    const { result } = renderHook(() =>
      useVoiceRecorder({ onFinal, lang: "en-US", deps: r.deps }),
    );
    act(() => result.current.start());
    await waitFor(() => expect(result.current.state).toEqual({ status: "recording" }));

    r.emitChunk(64);
    act(() => result.current.cancel());
    expect(result.current.state).toEqual({ status: "idle" });
    expect(r.transcribe).not.toHaveBeenCalled();
    expect(onFinal).not.toHaveBeenCalled();
    expect(r.tracks[0]!.stop).toHaveBeenCalled();
  });
});
