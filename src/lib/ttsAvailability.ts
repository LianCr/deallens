"use client";

import { useSyncExternalStore } from "react";

/**
 * Does this deployment have a speech-synthesis model (`/api/speak`)?
 * Same shape as sttAvailability: one probe per page session, shared by
 * every speaker button; "unknown" is treated as "not enabled" so the
 * UI never flickers a control it might have to take away.
 */

export type TtsAvailability = "unknown" | "enabled" | "disabled";

let state: TtsAvailability = "unknown";
let probeStarted = false;
const listeners = new Set<() => void>();

function settle(next: TtsAvailability): void {
  state = next;
  for (const listener of listeners) listener();
}

function probe(): void {
  if (probeStarted || typeof window === "undefined") return;
  probeStarted = true;
  fetch("/api/speak")
    .then((response) => (response.ok ? response.json() : { enabled: false }))
    .then((data: { enabled?: boolean }) => settle(data.enabled ? "enabled" : "disabled"))
    .catch(() => settle("disabled"));
}

const subscribe = (listener: () => void) => {
  probe();
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useTtsAvailability(): TtsAvailability {
  return useSyncExternalStore(subscribe, () => state, () => "unknown" as const);
}

/** Pin the store for unit tests (skips the network probe entirely). */
export function primeTtsAvailabilityForTests(value: TtsAvailability): void {
  state = value;
  probeStarted = true;
}

export function resetTtsAvailabilityForTests(): void {
  state = "unknown";
  probeStarted = false;
  listeners.clear();
}
