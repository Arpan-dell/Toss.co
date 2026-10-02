// Error logging without personal data. Server logs (Vercel) are readable by anyone with project access and
// are kept by a third party, so a log line carries only what's needed to debug: where it failed, the error's
// type and code, and its message with anything personal or secret replaced by [REDACTED]. Database errors'
// `details`/`hint` (which can echo row values, e.g. a duplicate phone number) are never logged.

const PATTERNS: RegExp[] = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, // emails
  /\b\d{6,}:[A-Za-z0-9_-]{20,}/g, // Telegram bot tokens
  /\b(?:sb_secret|sb_publishable|sk|pk)_[A-Za-z0-9_-]{8,}/g, // API keys
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, // auth headers
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g, // JWTs
  /\+?\d[\d\s-]{8,}\d/g, // phone numbers, Telegram IDs, long digit runs
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, // UUIDs (user/order IDs)
];

export function redact(text: string): string {
  return PATTERNS.reduce((t, re) => t.replace(re, "[REDACTED]"), text).slice(0, 300);
}

/**
 * Log a failure with no personal data: `context` should be a fixed string like "invoice email failed".
 * Returns a short reference ID that's also in the log line, so a generic error shown to someone can be
 * matched to its details here.
 */
export function logError(context: string, err?: unknown): string {
  const ref = crypto.randomUUID().slice(0, 8);
  if (err === undefined) {
    console.error(`[ref ${ref}] ${context}`);
    return ref;
  }
  const e = err as { name?: unknown; code?: unknown; status?: unknown; message?: unknown };
  const parts = [
    typeof e?.name === "string" && e.name !== "Error" ? e.name : "",
    typeof e?.code === "string" || typeof e?.code === "number" ? `code=${e.code}` : "",
    typeof e?.status === "number" ? `status=${e.status}` : "",
    redact(typeof e?.message === "string" ? e.message : typeof err === "string" ? err : ""),
  ].filter(Boolean);
  console.error(`[ref ${ref}] ${context}`, parts.join(" "));
  return ref;
}
