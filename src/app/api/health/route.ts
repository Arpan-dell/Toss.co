import { NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/log";

// Health check for uptime monitoring (UptimeRobot): 200 {"ok":true} when the app is up AND the database answers,
// 503 otherwise, so an outage of either sends the alert. Answers on every host (site, app and the old vercel.app
// address the baskets and the driver bot use). Says nothing about the data; never cached.
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 5000;

export async function GET() {
  const started = Date.now();
  let db = false;
  if (isSupabaseConfigured()) {
    try {
      const query = supabaseAdmin().from("platform_settings").select("id").eq("id", 1).maybeSingle();
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("database timed out")), TIMEOUT_MS));
      const { error } = await Promise.race([query, timeout]);
      db = !error;
      if (error) logError("health: database error", error);
    } catch (err) {
      logError("health: database unreachable", err);
    }
  }
  const ok = db;
  return NextResponse.json(
    { ok, app: "up", database: db ? "up" : "down", ms: Date.now() - started },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
  );
}

// UptimeRobot's free plan checks with HEAD requests on some monitor types
export async function HEAD() {
  const res = await GET();
  return new NextResponse(null, { status: res.status, headers: res.headers });
}
