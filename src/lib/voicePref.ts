"use client";

import { useSyncExternalStore } from "react";

/**
 * "Voice replies" preference: should new Q&A answers speak on their
 * own? ON by default — the coach talks like a person unless told not
 * to. The toggle only gates AUTO-play; every reply keeps its manual
 * speaker button either way. Persisted in localStorage; a module store
 * keeps every surface in agreement.
 */

const STORAGE_KEY = "deallens-voice-replies";

let current: boolean | null = null;
const listeners = new Set<() => void>();

function read(): boolean {
  if (current !== null) return current;
  try {
    current =
      typeof window !== "undefined"
        ? window.localStorage.getItem(STORAGE_KEY) !== "off"
        : true;
  } catch {
    current = true;
  }
  return current;
}

export function getVoicePref(): boolean {
  return read();
}

export function setVoicePref(on: boolean): void {
  current = on;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Private mode etc. — the in-memory value still works for the session.
  }
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useVoicePref(): boolean {
  return useSyncExternalStore(subscribe, read, () => true);
}

export function resetVoicePrefForTests(): void {
  current = null;
  listeners.clear();
}
