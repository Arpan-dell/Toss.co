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
    keep(context, "", ref);
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
  keep(context, parts.join(" "), ref);
  return ref;
}

// A copy in the error_log table (migration 0040) for the owner's Errors page. Never throws and never waits: a
// failure to record an error must not become a new error. The same context is kept at most once a minute per
// server instance, so one broken thing can't fill the table.
const lastKept = new Map<string, number>();
function keep(context: string, detail: string, ref: string, source: "server" | "browser" = "server") {
  if (typeof window !== "undefined" || process.env.NODE_ENV === "test") return;
  const key = `${source}:${context}`;
  const now = Date.now();
  if (now - (lastKept.get(key) ?? 0) < 60_000) return;
  lastKept.set(key, now);
  if (lastKept.size > 200) lastKept.clear();
  void import("./supabase/admin")
    .then(({ isSupabaseConfigured, supabaseAdmin }) => {
      if (!isSupabaseConfigured()) return;
      return supabaseAdmin().from("error_log").insert({ source, context: context.slice(0, 200), detail: detail.slice(0, 300) || null, ref });
    })
    .catch(() => {});
}

/** Records an error that happened in someone's browser (reported by /api/client-error). Redacted like any other. */
export function logBrowserError(context: string, detail: string, digest?: string): string {
  const ref = digest?.slice(0, 16) || crypto.randomUUID().slice(0, 8);
  const clean = redact(detail);
  console.error(`[ref ${ref}] browser: ${context}`, clean);
  keep(`browser: ${redact(context).slice(0, 120)}`, clean, ref, "browser");
  return ref;
}
