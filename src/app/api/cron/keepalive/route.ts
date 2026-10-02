import { createHash, timingSafeEqual } from "node:crypto";
import { runAutopilotAll } from "@/lib/ai/autopilot";
import { runPlanReminders } from "@/lib/email/notify";
import { runWinback } from "@/lib/offers";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase/admin";

// Daily Vercel Cron (see vercel.json, 08:30 IST). Keeps the free Supabase project awake (it pauses
// after a week without activity), sends win-back discounts to customers who have gone quiet, and
// emails renewal reminders to businesses whose trial or subscription is about to end, and runs the
// Toss AI morning analysis (and autopilot) for every active business.
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase not configured" }, { status: 503 });

  const { error } = await supabaseAdmin().from("tenants").select("id").limit(1);
  if (error) {
    console.error("keep-alive query failed", error.code);
    return Response.json({ error: "Database unavailable" }, { status: 500 });
  }
  const winback = await runWinback().catch((err) => {
    console.error("win-back run failed", err);
    return { error: "win-back failed" };
  });
  const reminders = await runPlanReminders().catch((err) => {
    console.error("plan reminders failed", err);
    return { error: "reminders failed" };
  });
  const ai = await runAutopilotAll(200_000).catch((err) => {
    console.error("Toss AI daily run failed", err);
    return { error: "ai failed" };
  });
  return Response.json({ ok: true, winback, reminders, ai });
}

// Constant-time check of "Bearer <CRON_SECRET>" (hashing first makes the lengths equal).
function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const h = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(h(header), h(`Bearer ${secret}`));
}
