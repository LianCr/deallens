"use client";

import { useSyncExternalStore } from "react";

/**
 * The deal target: the explored price the shopper is currently aiming
 * at, published by the QuoteExplorer island and consumed by the actions
 * around it (the AI brief button, for now). `null` means "not
 * exploring" — the dealer's actual quote is the only number in play.
 *
 * A module-level store read through `useSyncExternalStore` — the
 * sanctioned cross-island channel under this repo's react-hooks
 * compiler rules (no setState-in-effect, no ref-writes-in-render; see
 * src/lib/useSpeechInput.ts for the prior art). The server snapshot is
 * always null, so SSR and first paint agree: actions target the dealer
 * quote until the shopper actually explores.
 */

type Listener = () => void;

let target: number | null = null;
const listeners = new Set<Listener>();

export function getDealTarget(): number | null {
  return target;
}

export function setDealTarget(next: number | null): void {
  if (next === target) return;
  target = next;
  for (const listener of listeners) listener();
}

export function subscribeDealTarget(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getServerDealTarget = (): number | null => null;

/** React binding: re-renders the consumer whenever the target changes. */
export function useDealTarget(): number | null {
  return useSyncExternalStore(subscribeDealTarget, getDealTarget, getServerDealTarget);
}
