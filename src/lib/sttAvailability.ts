"use client";

import { useSyncExternalStore } from "react";

/**
 * Does this deployment have a server speech model (`/api/transcribe`)?
 *
 * A module store probed at most once per page session, shared by every
 * mic button: the answer decides which dictation tier a click starts,
 * and — on browsers without the Web Speech API — whether a mic renders
 * at all. The probe kicks off on first subscription (never during
 * render), and until it answers the state is "unknown", which callers
 * treat as "not enabled" so nothing flickers.
 */

export type SttAvailability = "unknown" | "enabled" | "disabled";

let state: SttAvailability = "unknown";
let probeStarted = false;
const listeners = new Set<() => void>();

function settle(next: SttAvailability): void {
  state = next;
  for (const listener of listeners) listener();
}

function probe(): void {
  if (probeStarted || typeof window === "undefined") return;
  probeStarted = true;
  fetch("/api/transcribe")
    .then((response) => (response.ok ? response.json() : { enabled: false }))
    .then((data: { enabled?: boolean }) => settle(data.enabled ? "enabled" : "disabled"))
    .catch(() => settle("disabled"));
}

const subscribe = (listener: () => void) => {
  probe();
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useSttAvailability(): SttAvailability {
  return useSyncExternalStore(subscribe, () => state, () => "unknown" as const);
}

/** Pin the store for unit tests (skips the network probe entirely). */
export function primeSttAvailabilityForTests(value: SttAvailability): void {
  state = value;
  probeStarted = true;
}

export function resetSttAvailabilityForTests(): void {
  state = "unknown";
  probeStarted = false;
  listeners.clear();
}
