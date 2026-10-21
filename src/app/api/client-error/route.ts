import { logBrowserError } from "@/lib/log";
import { allow, clientIp } from "@/lib/rate-limit";

// Receives "this screen failed" reports from error.tsx. Anyone can post here, so it only ever stores short,
// redacted text, a few per visitor, and answers the same whatever happens.
export async function POST(request: Request) {
  try {
    if (!(await allow("clientErrorIp", await clientIp()))) return new Response(null, { status: 204 });
    const b = (await request.json()) as { name?: unknown; message?: unknown; digest?: unknown; path?: unknown };
    const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
    logBrowserError(`screen failed at ${str(b.path, 120) || "?"}`, `${str(b.name, 40)} ${str(b.message, 300)}`.trim(), str(b.digest, 16) || undefined);
  } catch {
    /* ignore malformed reports */
  }
  return new Response(null, { status: 204 });
}
