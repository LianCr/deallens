/**
 * Cost guardrails that make "a personal API key behind a public demo"
 * defensible: per-IP sliding-window rate limits, a global daily budget,
 * and a response cache (pricing is deterministic, so identical deals
 * produce identical briefs — most demo traffic should cost $0).
 *
 * Deliberately in-memory. On serverless this is per-instance best-effort
 * — good enough at demo scale, and the honest trade-off (plus the KV
 * upgrade path) is written down in docs/adr/005-ai-native.md.
 *
 * All limits are env-overridable so E2E can exercise the 429 path with
 * tiny values. The classes take an injectable clock for unit tests.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface GuardConfig {
  perIpPerMinute: number;
  perIpPerDay: number;
  globalPerDay: number;
}

const positiveInt = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

export function guardConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): GuardConfig {
  return {
    perIpPerMinute: positiveInt(env.AI_LIMIT_IP_PER_MINUTE, 10),
    perIpPerDay: positiveInt(env.AI_LIMIT_IP_PER_DAY, 30),
    globalPerDay: positiveInt(env.AI_LIMIT_GLOBAL_PER_DAY, 300),
  };
}

export type GuardVerdict =
  | { ok: true }
  | { ok: false; reason: "ip-minute" | "ip-day" | "global-day"; message: string };

/** Honest, user-facing copy for each limit — no fake error codes. */
export const GUARD_MESSAGES = {
  "ip-minute": "Easy there — a couple of AI requests per minute is plenty. Try again shortly.",
  "ip-day": "You've reached today's per-visitor AI limit for this demo.",
  "global-day": "AI is resting — daily demo budget reached. Try again tomorrow.",
} as const;

export class AiGuard {
  /** Per-IP request timestamps within the last day, oldest first. */
  private hits = new Map<string, number[]>();
  private globalHits: number[] = [];

  constructor(
    private readonly config: GuardConfig,
    private readonly now: () => number = Date.now,
  ) {}

  /** Checks limits and, if allowed, records the request. */
  check(ip: string): GuardVerdict {
    const t = this.now();
    this.prune(t);

    const stamps = this.hits.get(ip) ?? [];
    const inLastMinute = stamps.filter((s) => t - s < MINUTE_MS).length;
    if (inLastMinute >= this.config.perIpPerMinute) {
      return { ok: false, reason: "ip-minute", message: GUARD_MESSAGES["ip-minute"] };
    }
    if (stamps.length >= this.config.perIpPerDay) {
      return { ok: false, reason: "ip-day", message: GUARD_MESSAGES["ip-day"] };
    }
    if (this.globalHits.length >= this.config.globalPerDay) {
      return { ok: false, reason: "global-day", message: GUARD_MESSAGES["global-day"] };
    }

    stamps.push(t);
    this.hits.set(ip, stamps);
    this.globalHits.push(t);
    return { ok: true };
  }

  private prune(t: number): void {
    for (const [ip, stamps] of this.hits) {
      const kept = stamps.filter((s) => t - s < DAY_MS);
      if (kept.length === 0) this.hits.delete(ip);
      else this.hits.set(ip, kept);
    }
    this.globalHits = this.globalHits.filter((s) => t - s < DAY_MS);
  }
}

/** Bounded TTL cache for finished AI responses. */
export class ResponseCache {
  private entries = new Map<string, { value: string; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number = DAY_MS,
    private readonly maxEntries: number = 500,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): string | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: string): void {
    if (!this.entries.has(key) && this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }
}

/**
 * Cache key for a deal brief. Quotes are bucketed in ~2% logarithmic
 * steps: two quotes within 2% of each other land in the same market
 * position, so they can share a brief — and share its cost. The
 * shopper's negotiation target (when present) is bucketed the same way:
 * a brief aimed at $23,000 must not be replayed for one aimed at $25,000.
 */
export function briefCacheKey(
  make: string,
  year: number,
  model: string,
  quote: number,
  target?: number,
): string {
  const bucket = (value: number): number => Math.round(Math.log(value) / Math.log(1.02));
  const targetPart = target === undefined ? "" : `~t${bucket(target)}`;
  return `${make.toLowerCase()}/${year}/${model.toLowerCase()}@${bucket(quote)}${targetPart}`;
}

/**
 * Module-level singletons, stashed on globalThis so dev-server hot
 * reloads don't reset counters. Serverless: per-instance (see header).
 */
const store = globalThis as unknown as {
  __dealLensAiGuard?: AiGuard;
  __dealLensBriefCache?: ResponseCache;
};

export function getAiGuard(): AiGuard {
  store.__dealLensAiGuard ??= new AiGuard(guardConfigFromEnv());
  return store.__dealLensAiGuard;
}

export function getBriefCache(): ResponseCache {
  store.__dealLensBriefCache ??= new ResponseCache();
  return store.__dealLensBriefCache;
}
