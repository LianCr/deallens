import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  getDealTarget,
  setDealTarget,
  subscribeDealTarget,
  useDealTarget,
} from "./dealTarget";

afterEach(() => {
  setDealTarget(null);
});

describe("dealTarget store", () => {
  test("starts empty, holds what it is given, and clears", () => {
    expect(getDealTarget()).toBeNull();
    setDealTarget(23_950);
    expect(getDealTarget()).toBe(23_950);
    setDealTarget(null);
    expect(getDealTarget()).toBeNull();
  });

  test("notifies subscribers on change, but not on a same-value set", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDealTarget(listener);

    setDealTarget(22_450);
    expect(listener).toHaveBeenCalledTimes(1);
    setDealTarget(22_450);
    expect(listener).toHaveBeenCalledTimes(1);
    setDealTarget(null);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    setDealTarget(25_000);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("useDealTarget re-renders consumers as the target moves", () => {
    const { result } = renderHook(() => useDealTarget());
    expect(result.current).toBeNull();

    act(() => setDealTarget(23_950));
    expect(result.current).toBe(23_950);

    act(() => setDealTarget(null));
    expect(result.current).toBeNull();
  });
});
