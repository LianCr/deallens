import { describe, expect, it } from "vitest";
import {
  AiGuard,
  ResponseCache,
  briefCacheKey,
  guardConfigFromEnv,
} from "./guard";

const MINUTE = 60_000;
const DAY = 24 * 60 * 60 * 1000;

/** Manually advanced clock so windows are tested without real timers. */
function fakeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("AiGuard", () => {
  const config = { perIpPerMinute: 2, perIpPerDay: 4, globalPerDay: 6 };

  it("blocks an IP that exceeds the per-minute window, then recovers", () => {
    const clock = fakeClock();
    const guard = new AiGuard(config, clock.now);
    expect(guard.check("a").ok).toBe(true);
    expect(guard.check("a").ok).toBe(true);
    const blocked = guard.check("a");
    expect(blocked).toMatchObject({ ok: false, reason: "ip-minute" });
    clock.advance(MINUTE);
    expect(guard.check("a").ok).toBe(true);
  });

  it("enforces the per-IP daily cap across minute windows", () => {
    const clock = fakeClock();
    const guard = new AiGuard(config, clock.now);
    for (let i = 0; i < 4; i++) {
      expect(guard.check("a").ok).toBe(true);
      clock.advance(MINUTE);
    }
    expect(guard.check("a")).toMatchObject({ ok: false, reason: "ip-day" });
    clock.advance(DAY);
    expect(guard.check("a").ok).toBe(true);
  });

  it("enforces the global daily budget across IPs with honest copy", () => {
    const clock = fakeClock();
    const guard = new AiGuard(config, clock.now);
    for (let i = 0; i < 6; i++) {
      expect(guard.check(`ip-${i}`).ok).toBe(true);
    }
    const blocked = guard.check("fresh-ip");
    expect(blocked).toMatchObject({ ok: false, reason: "global-day" });
    if (!blocked.ok) expect(blocked.message).toContain("AI is resting");
  });

  it("keeps per-IP counters independent", () => {
    const clock = fakeClock();
    const guard = new AiGuard(config, clock.now);
    expect(guard.check("a").ok).toBe(true);
    expect(guard.check("a").ok).toBe(true);
    expect(guard.check("a").ok).toBe(false);
    expect(guard.check("b").ok).toBe(true);
  });
});

describe("guardConfigFromEnv", () => {
  it("reads overrides and falls back on junk", () => {
    expect(
      guardConfigFromEnv({
        AI_LIMIT_IP_PER_MINUTE: "3",
        AI_LIMIT_IP_PER_DAY: "not-a-number",
        AI_LIMIT_GLOBAL_PER_DAY: "-5",
      }),
    ).toEqual({ perIpPerMinute: 3, perIpPerDay: 30, globalPerDay: 300 });
  });

  it("uses documented defaults when unset", () => {
    expect(guardConfigFromEnv({})).toEqual({
      perIpPerMinute: 10,
      perIpPerDay: 30,
      globalPerDay: 300,
    });
  });
});

describe("ResponseCache", () => {
  it("returns cached values until the TTL expires", () => {
    const clock = fakeClock();
    const cache = new ResponseCache(1000, 10, clock.now);
    cache.set("k", "v");
    expect(cache.get("k")).toBe("v");
    clock.advance(1001);
    expect(cache.get("k")).toBeUndefined();
  });

  it("evicts the oldest entry at capacity", () => {
    const clock = fakeClock();
    const cache = new ResponseCache(DAY, 2, clock.now);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("2");
    expect(cache.get("c")).toBe("3");
  });
});

describe("briefCacheKey", () => {
  it("buckets near-identical quotes into the same key, case-insensitively", () => {
    // Buckets are ~2% wide, so a same-bucket pair must sit well inside
    // one step; a 0.1% delta can only straddle a boundary by bad luck,
    // which this fixed pair does not.
    expect(briefCacheKey("Honda", 2022, "Civic", 24500)).toBe(
      briefCacheKey("honda", 2022, "civic", 24520),
    );
  });

  it("separates quotes that are clearly different", () => {
    expect(briefCacheKey("Honda", 2022, "Civic", 24500)).not.toBe(
      briefCacheKey("Honda", 2022, "Civic", 27000),
    );
  });

  it("separates vehicles", () => {
    expect(briefCacheKey("Honda", 2022, "Civic", 24500)).not.toBe(
      briefCacheKey("Honda", 2023, "Civic", 24500),
    );
  });
});
