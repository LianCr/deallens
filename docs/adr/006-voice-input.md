# ADR 006 — Voice input is the browser's job

## Status

Accepted.

## Context

The natural-language surfaces added in ADR 005 invite spoken input:
"reliable family SUV under $30k" is a sentence people say more easily
than they type, and ChatGPT normalized dictation with live interim
transcription as table stakes for an NL text box. The obvious
implementation is server-side speech-to-text — record with
MediaRecorder, upload, transcribe with a vendor STT API. That path
fails this repo's constraints twice over: Anthropic offers no STT API,
so transcription would mean a second vendor and a second key, breaking
the clone-and-run red line the whole demo is built on; and it puts
shopper audio on our server, which is a real privacy liability for a
feature that is strictly a convenience.

## Decision

**Dictation uses the browser-native Web Speech API
(`SpeechRecognition`), as progressive enhancement — no server, no
vendor key, no bundle cost.** Concretely, four mechanisms:

1. **Feature detection decides whether the control exists at all.**
   `window.SpeechRecognition ?? window.webkitSpeechRecognition` — where
   the API is missing (Firefox, and every server render) the mic button
   renders nothing. No dead button, no "coming soon" tooltip: honest
   degradation, and the degradation itself is E2E-tested on the
   Playwright firefox project, which runs without any fake installed.

2. **The transcript is a draft, never a command.** `interimResults`
   streams live text into the input (visually muted while provisional);
   the final utterance settles in as ordinary editable text. Submission
   stays manual — a misheard "under $13k" for "under $30k" gets read
   and corrected by the user before it ever reaches the model. This is
   the ADR 005 grounding stance applied to input: unverified content
   doesn't act, it waits for confirmation.

3. **The privacy trade is disclosed where it happens.** Browser speech
   services are not local: Chrome ships audio to Google, Safari to
   Apple. The mic button's accessible description says so ("transcribed
   by your browser's speech service; audio never reaches DealLens
   servers") — the same honesty rule as the DEMO pricing badge, applied
   to a data flow instead of a dataset.

4. **The recognizer constructor is injectable, so tests never need a
   microphone.** `useSpeechInput` takes the constructor as an optional
   dependency (the same pattern as the injectable clock in
   `src/ai/guard.ts`); unit tests drive the full state machine —
   unsupported, idle, listening, permission-denied, no-speech, cancel —
   with a scriptable fake, and Playwright installs a deterministic fake
   via `addInitScript` so the real feature-detection and hydration path
   runs in every browser project.

Error states follow the honest-empty-state rule: a denied microphone
says "typing still works", silence says "try again, or keep typing" —
the feature always fails back to the keyboard it enhanced.

## Consequences

- Recognition quality and language coverage are whatever the browser
  vendor ships; we get no knobs beyond the language tag. Acceptable for
  a convenience layer whose fallback is typing.
- Firefox users never see the feature. That is the design, not a bug:
  a browser API gap is surfaced as absence, not as a broken control.
- Audio never touches DealLens infrastructure, so there is nothing to
  secure, retain, or pay for — but also nothing to tune.
- The upgrade path, should on-server transcription ever be justified,
  is mechanical and mirrors the existing BYOK pattern: MediaRecorder
  capture posted to an STT route that returns 503 without an optional
  vendor key, with this browser path remaining the keyless default.
  Live interim transcription would need a streaming STT vendor;
  batch-only transcription would lose the ChatGPT-style liveness that
  motivated the feature.
