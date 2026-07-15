import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ASK_SEARCH_MAX_USES,
  BRIEF_SEARCH_MAX_USES,
  webSearchEnabled,
  webSearchTools,
} from "./webSearch";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("webSearchTools", () => {
  it("is on by default, with a per-request search cap and US localization", () => {
    expect(webSearchEnabled()).toBe(true);
    const tools = webSearchTools(BRIEF_SEARCH_MAX_USES)!;
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      type: "web_search_20260209",
      name: "web_search",
      max_uses: BRIEF_SEARCH_MAX_USES,
      user_location: { type: "approximate", country: "US" },
    });
  });

  it("AI_WEB_SEARCH=0 is the kill switch — no tools reach the request", () => {
    vi.stubEnv("AI_WEB_SEARCH", "0");
    expect(webSearchEnabled()).toBe(false);
    expect(webSearchTools(ASK_SEARCH_MAX_USES)).toBeUndefined();
  });

  it("caps stay small — searches cost real money per use", () => {
    expect(BRIEF_SEARCH_MAX_USES).toBeLessThanOrEqual(3);
    expect(ASK_SEARCH_MAX_USES).toBeLessThanOrEqual(3);
  });
});
