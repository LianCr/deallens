import type {
  SpeechErrorEventLike,
  SpeechResultEventLike,
  SpeechResultLike,
} from "./useSpeechInput";

/**
 * Test double for the Web Speech API — a scriptable recognizer
 * implementing the SpeechRecognizerLike slice. Passed through the
 * injectable-constructor seam of useSpeechInput (same pattern as the
 * injectable clock in src/ai/guard.ts) so unit and component tests can
 * drive every state transition without a microphone or a browser
 * speech service. Imported only from tests.
 */
export class FakeRecognizer {
  static instances: FakeRecognizer[] = [];

  static reset() {
    FakeRecognizer.instances = [];
  }

  static last(): FakeRecognizer {
    const last = FakeRecognizer.instances.at(-1);
    if (!last) throw new Error("no recognizer constructed yet");
    return last;
  }

  lang = "";
  interimResults = false;
  continuous = false;
  onresult: ((event: SpeechResultEventLike) => void) | null = null;
  onerror: ((event: SpeechErrorEventLike) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  aborted = false;

  constructor() {
    FakeRecognizer.instances.push(this);
  }

  start() {
    this.started = true;
  }

  stop() {
    // The real API flushes pending finals before onend; the fake's
    // finals were already emitted explicitly, so just end.
    this.onend?.();
  }

  abort() {
    this.aborted = true;
    // The real API fires an "aborted" error and then end.
    this.onerror?.({ error: "aborted" });
    this.onend?.();
  }

  emitResult(text: string, isFinal: boolean) {
    const result: SpeechResultLike = { isFinal, length: 1, 0: { transcript: text } };
    this.onresult?.({ results: [result] });
  }

  emitError(error: string) {
    this.onerror?.({ error });
    this.onend?.();
  }

  end() {
    this.onend?.();
  }
}
