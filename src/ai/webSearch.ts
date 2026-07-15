import type Anthropic from "@anthropic-ai/sdk";

/**
 * Real web research for the AI surfaces, via Anthropic's server-side
 * web-search tool (`web_search_20260209` — dynamic filtering built in,
 * so searched pages are filtered before they reach the context window).
 *
 * Product logic: the search gives the coach real homework — recalls,
 * current incentives, known model issues, real-world asking prices —
 * while the grounding contract holds: this deal's verdict numbers still
 * come only from the FACTS block, and web findings arrive with their
 * source named (the prompts enforce the attribution).
 *
 * Cost: $10 per 1,000 searches plus result tokens as input. `max_uses`
 * bounds the per-request spend, the shared AI guard bounds requests per
 * day, and the brief's response cache means repeat deals never
 * re-search. AI_WEB_SEARCH=0 turns the tool off without touching code.
 */

export const BRIEF_SEARCH_MAX_USES = 3;
export const ASK_SEARCH_MAX_USES = 2;

export function webSearchEnabled(): boolean {
  return process.env.AI_WEB_SEARCH !== "0";
}

/** The `tools` array for a Messages call, or undefined when disabled. */
export function webSearchTools(
  maxUses: number,
): Anthropic.Messages.ToolUnion[] | undefined {
  if (!webSearchEnabled()) return undefined;
  return [
    {
      type: "web_search_20260209",
      name: "web_search",
      max_uses: maxUses,
      // The car market DealLens contextualizes is US-based.
      user_location: { type: "approximate", country: "US" },
    },
  ];
}
