import { describe, expect, test } from "vitest";
import { laptopResearchAdapter } from "@/research/laptopAdapter";
import { assessDeal } from "@/domain/verdict";

describe("LaptopResearchAdapter", () => {
  test("proves a second vertical can run the same math path", async () => {
    const req = await laptopResearchAdapter.parseRequest({
      title: "Framework Laptop 13 16GB",
      price: 999,
    });
    const raw = await laptopResearchAdapter.collectEvidence(req);
    const candidates = laptopResearchAdapter.normalize(raw);
    const set = laptopResearchAdapter.selectComparables(req.target, candidates);
    expect(set.sampleSize).toBeGreaterThanOrEqual(5);
    const { verdict } = assessDeal(req.target.price, set.observations.map((o) => o.price));
    expect(verdict).not.toBe("INSUFFICIENT_DATA");
  });
});
