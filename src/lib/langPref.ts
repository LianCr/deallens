"use client";

import { useSyncExternalStore } from "react";

/**
 * Dictation-language preference, shared by every mic on the page.
 * "auto" follows the browser's UI language — the right default — but a
 * mismatch (speaking Mandarin on an English-locale machine) is the
 * single biggest recognition killer, so the toggle exists. Persisted in
 * localStorage; a module store keeps all mic buttons in agreement.
 */

export type LangPref = "auto" | "en-US" | "zh-CN";

export const LANG_PREF_CYCLE: LangPref[] = ["auto", "en-US", "zh-CN"];

export const LANG_PREF_LABEL: Record<LangPref, string> = {
  auto: "Auto",
  "en-US": "EN",
  "zh-CN": "中文",
};

const STORAGE_KEY = "deallens-dictation-lang";

const isLangPref = (value: unknown): value is LangPref =>
  value === "auto" || value === "en-US" || value === "zh-CN";

let current: LangPref | null = null;
const listeners = new Set<() => void>();

function read(): LangPref {
  if (current !== null) return current;
  try {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    current = isLangPref(stored) ? stored : "auto";
  } catch {
    current = "auto";
  }
  return current;
}

export function getLangPref(): LangPref {
  return read();
}

export function setLangPref(pref: LangPref): void {
  current = pref;
  try {
    window.localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Private mode etc. — the in-memory value still works for the session.
  }
  for (const listener of listeners) listener();
}

export function cycleLangPref(): void {
  const index = LANG_PREF_CYCLE.indexOf(read());
  setLangPref(LANG_PREF_CYCLE[(index + 1) % LANG_PREF_CYCLE.length]!);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useLangPref(): LangPref {
  return useSyncExternalStore(subscribe, read, () => "auto" as const);
}

/** The BCP 47 tag handed to the recognizer / STT service. */
export function resolveLang(pref: LangPref): string {
  if (pref !== "auto") return pref;
  return (typeof navigator !== "undefined" && navigator.language) || "en-US";
}

export function resetLangPrefForTests(): void {
  current = null;
  listeners.clear();
}
