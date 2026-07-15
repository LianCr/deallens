/**
 * Turn an AI reply (which may carry the brief's light markdown) into
 * text a speech model should read aloud — no "asterisk asterisk" bold
 * markers, no heading hashes, no backticks. Lives outside route.ts
 * because Next.js route modules may only export HTTP handlers.
 */

/** Longest text we'll voice — roughly the longest brief, with margin. */
export const MAX_SPEAK_CHARS = 2_000;

export function speakableText(raw: string): string {
  return raw
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold** → bold
    .replace(/\*([^*]+)\*/g, "$1") // *italic* → italic
    .replace(/^#{1,6}\s+/gm, "") // markdown headings
    .replace(/`([^`]+)`/g, "$1") // `code` → code
    .replace(/[ \t]+/g, " ") // collapse runs of spaces
    .replace(/\n{3,}/g, "\n\n") // collapse blank-line runs
    .trim();
}
