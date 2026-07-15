import { describe, expect, it } from "vitest";
import { AskBodySchema, MAX_TURNS } from "./schema";

const validBody = {
  make: "honda",
  year: 2022,
  model: "civic",
  quote: 24500,
  question: "Is this a fair price?",
};

const turn = (index: number) => ({ q: `question ${index}`, a: `answer ${index}` });

describe("AskBodySchema", () => {
  it("accepts a minimal body and defaults turns to empty", () => {
    const parsed = AskBodySchema.parse(validBody);
    expect(parsed.turns).toEqual([]);
    expect(parsed.question).toBe("Is this a fair price?");
  });

  it("accepts up to MAX_TURNS prior turns", () => {
    const turns = Array.from({ length: MAX_TURNS }, (_, i) => turn(i));
    const parsed = AskBodySchema.parse({ ...validBody, turns });
    expect(parsed.turns).toHaveLength(MAX_TURNS);
  });

  it("rejects more than MAX_TURNS prior turns", () => {
    const turns = Array.from({ length: MAX_TURNS + 1 }, (_, i) => turn(i));
    expect(() => AskBodySchema.parse({ ...validBody, turns })).toThrow();
  });

  it("bounds the question length to 3–300 characters", () => {
    expect(() => AskBodySchema.parse({ ...validBody, question: "hi" })).toThrow();
    expect(() =>
      AskBodySchema.parse({ ...validBody, question: "x".repeat(301) }),
    ).toThrow();
    expect(
      AskBodySchema.parse({ ...validBody, question: "x".repeat(300) }).question,
    ).toHaveLength(300);
  });

  it("length-caps replayed turn text so history can't balloon spend", () => {
    expect(() =>
      AskBodySchema.parse({ ...validBody, turns: [{ q: "x".repeat(301), a: "fine" }] }),
    ).toThrow();
    expect(() =>
      AskBodySchema.parse({ ...validBody, turns: [{ q: "fine", a: "x".repeat(2001) }] }),
    ).toThrow();
    expect(() =>
      AskBodySchema.parse({ ...validBody, turns: [{ q: "", a: "fine" }] }),
    ).toThrow();
  });

  it("keeps the deal-brief vehicle bounds", () => {
    expect(() => AskBodySchema.parse({ ...validBody, year: 1979 })).toThrow();
    expect(() => AskBodySchema.parse({ ...validBody, quote: 0 })).toThrow();
    expect(() => AskBodySchema.parse({ ...validBody, make: "" })).toThrow();
  });
});
