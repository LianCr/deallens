// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const connect = vi.fn();
const updateOne = vi.fn();
const insertMany = vi.fn();
const ctorOptions: unknown[] = [];

vi.mock("mongodb", () => ({
  MongoClient: class {
    constructor(_uri: string, options: unknown) {
      ctorOptions.push(options);
    }
    connect = connect;
    db = () => ({ collection: () => ({ updateOne, insertMany }) });
  },
}));

import type { EvidenceBundle } from "./types";

const bundle = {
  session: { id: "s1" },
  target: { make: "Honda", model: "Civic", year: 2022 },
  comparables: { observations: [] },
} as unknown as EvidenceBundle;

describe("saveResearchBundle", () => {
  beforeEach(() => {
    vi.resetModules();
    connect.mockReset();
    updateOne.mockReset().mockResolvedValue({});
    ctorOptions.length = 0;
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is a no-op returning false without MONGODB_URI", async () => {
    vi.stubEnv("MONGODB_URI", "");
    const { saveResearchBundle } = await import("./persist");
    expect(await saveResearchBundle(bundle)).toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });

  it("fails fast and retries on the next call instead of caching the failure", async () => {
    vi.stubEnv("MONGODB_URI", "mongodb://unreachable.invalid:27017");
    const { saveResearchBundle, MONGO_TIMEOUT_MS } = await import("./persist");

    connect.mockRejectedValueOnce(new Error("Server selection timed out"));
    await expect(saveResearchBundle(bundle)).rejects.toThrow(/timed out/);
    expect(ctorOptions[0]).toMatchObject({ serverSelectionTimeoutMS: MONGO_TIMEOUT_MS });

    connect.mockResolvedValueOnce(undefined);
    expect(await saveResearchBundle(bundle)).toBe(true);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(updateOne).toHaveBeenCalledOnce();
  });
});
