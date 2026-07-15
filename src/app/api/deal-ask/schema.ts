import { z } from "zod";

/**
 * Body schema for /api/deal-ask, in its own module because Next.js
 * route files may only export route handlers — and the unit tests want
 * to exercise these bounds without importing the Anthropic SDK.
 *
 * Turns are capped at four and each field is length-capped so replayed
 * history can't balloon token spend; the client drops its oldest turn
 * past the cap, and the schema rejects anything longer. Answers are
 * capped generously above the prompt's 120-word limit.
 */

export const MAX_TURNS = 4;

/** Same vehicle bounds as /api/deal-brief, plus the free-text fields. */
export const AskBodySchema = z.object({
  make: z.string().trim().min(1).max(40),
  year: z.number().int().min(1980).max(2035),
  model: z.string().trim().min(1).max(60),
  quote: z.number().int().min(1).max(5_000_000),
  question: z.string().trim().min(3).max(300),
  turns: z
    .array(
      z.object({
        q: z.string().trim().min(1).max(300),
        a: z.string().trim().min(1).max(2000),
      }),
    )
    .max(MAX_TURNS)
    .default([]),
});

export type AskBody = z.infer<typeof AskBodySchema>;
