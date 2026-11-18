/**
 * Structured server logs: one JSON object per line, so Vercel's log
 * search (or any log drain) can filter on `event`, `route`, `reason`
 * instead of grepping prose. Server-only; never pass secrets or raw
 * request bodies in `fields`.
 */

export type LogLevel = "info" | "warn" | "error";

export interface LogRecord {
  ts: string;
  level: LogLevel;
  event: string;
  [field: string]: unknown;
}

export function formatLog(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
  now: Date = new Date(),
): string {
  const record: LogRecord = { ts: now.toISOString(), level, event, ...fields };
  return JSON.stringify(record);
}

export function logEvent(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const line = formatLog(level, event, fields);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
