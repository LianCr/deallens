# ADR 006 — Voice input is the browser's job (with an optional server tier)

## Status

Accepted. Amended: the upgrade path in the consequences below has since
been exercised — see "Amendment: the two-tier architecture" at the end.

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

## Amendment: the two-tier architecture

Field use surfaced the ceiling quickly: Web Speech quality is whatever
the browser vendor ships, `continuous: false` cut dictations off at the
first breath, and accented or non-English speech transcribed poorly. Two
observations reshaped the feature:

1. **The browser tier was underconfigured, not just underpowered.**
   `continuous: true` plus our own silence endpointer
   (`SILENCE_SETTLE_MS`) stops the mid-sentence cut-offs; a dictation
   now settles once, when the speaker actually stops. A language toggle
   (Auto / EN / 中文, persisted) fixes the other classic killer — a
   recognizer locked to the wrong language tag.

2. **ChatGPT's dictation is not live streaming.** It records with level
   feedback, then produces one accurate transcript. That shape needs no
   streaming STT vendor — so the "batch-only transcription would lose
   the liveness" objection above dissolved, and the planned upgrade path
   was implemented as **tier 2**: MediaRecorder capture (with a Web
   Audio level meter) posted to `/api/transcribe`, which forwards to a
   Whisper-family model behind an optional `STT_API_KEY` — exactly the
   BYOK pattern, one budget shared with the LLM guard, audio never
   stored, 25-second/1 MB caps.

Tier selection is honest and automatic: the mic prefers the server tier
when the deployment enables it, falls back to Web Speech otherwise, and
renders only when at least one tier can work. A pleasant inversion
follows: **Firefox, the no-Web-Speech browser, gains dictation on
deployments with a speech model** — tested on the real Playwright
firefox project. Clone-and-run stays keyless; `MOCK_STT=1` keeps CI at
zero cost through the real route.

## Amendment: voice out — the coach talks back

The same key closes the loop in the other direction: `/api/speak`
forwards a finished reply to a speech-synthesis model
(`gpt-4o-mini-tts` by default, `TTS_MODEL`/`TTS_VOICE` tunable) and
streams the audio straight through — nothing stored, same shared rate
guard, same honest 503 without the key, `MOCK_TTS=1` for CI. New Q&A
answers speak automatically, and each answer's 🔊 is the one control —
no separate global toggle (field feedback: one button on the reply is
the whole interface). The brief is ~1.5 minutes of audio, so it gets a
manual "listen" button instead.

The pause/resume contract came free: the speaker button drives a plain
`<audio>` element, and the browser's own `pause()` keeps
`currentTime` — tap to pause at the exact spot, tap to resume from it,
tap after the end to replay. A module-level arbiter guarantees only
one utterance plays at a time (starting one pauses the other, which
keeps its place). A browser that blocks autoplay degrades to the
paused state — one tap starts it, never an error. Synthesis costs on
the order of a cent per minute of audio (per OpenAI's published
estimate for gpt-4o-mini-tts); the 2,000-character cap and the shared
daily guard bound the ceiling.
