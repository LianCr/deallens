import { afterEach, describe, expect, it, vi } from "vitest";
import { formatLog, logEvent } from "./log";

describe("formatLog", () => {
  it("emits one parseable JSON line with ts, level, event and fields", () => {
    const line = formatLog("info", "research.completed", { durationMs: 42 }, new Date("2026-11-17T00:00:00Z"));
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toEqual({
      ts: "2026-11-17T00:00:00.000Z",
      level: "info",
      event: "research.completed",
      durationMs: 42,
    });
  });
});

describe("logEvent", () => {
  afterEach(() => vi.restoreAllMocks());

  it("routes by level so platform log filters work", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logEvent("info", "a");
    logEvent("warn", "b");
    logEvent("error", "c", { upstream: { source: "serpapi", kind: "HTTP" } });
    expect(info).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.parse(error.mock.calls[0]![0] as string)).toMatchObject({
      level: "error",
      event: "c",
      upstream: { source: "serpapi", kind: "HTTP" },
    });
  });
});
