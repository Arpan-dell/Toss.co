import { createHash, timingSafeEqual } from "node:crypto";
import { runAutopilotAll } from "@/lib/ai/autopilot";
import { runLowStockAlerts, runPlanReminders } from "@/lib/email/notify";
import { runWinback } from "@/lib/offers";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/log";

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
    const ref = logError("keep-alive query failed", error.code);
    return Response.json({ error: "Database unavailable", ref }, { status: 500 });
  }
  // old rate-limit windows are useless after a day
  await supabaseAdmin().from("rate_limits").delete().lt("window_start", new Date(Date.now() - 86_400_000).toISOString());
  const winback = await runWinback().catch((err) => {
    logError("win-back run failed", err);
    return { error: "win-back failed" };
  });
  const reminders = await runPlanReminders().catch((err) => {
    logError("plan reminders failed", err);
    return { error: "reminders failed" };
  });
  const stock = await runLowStockAlerts().catch((err) => {
    logError("low-stock alerts failed", err);
    return { error: "stock alerts failed" };
  });
  const ai = await runAutopilotAll(200_000).catch((err) => {
    logError("Toss AI daily run failed", err);
    return { error: "ai failed" };
  });
  return Response.json({ ok: true, winback, reminders, stock, ai });
}

// Constant-time check of "Bearer <CRON_SECRET>" (hashing first makes the lengths equal).
function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const h = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(h(header), h(`Bearer ${secret}`));
}
