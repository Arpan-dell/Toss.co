import { NextResponse, type NextRequest } from "next/server";
import { getCustomer } from "@/lib/data";
import { getSession } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { attachTelegram } from "@/lib/telegram-link";
import { verifyMiniAppInitData } from "@/lib/telegram-miniapp";

// Called by the customer portal when it runs inside Telegram ("📱 Open Toss" in the customer bot).
// Telegram signs the launch data with the bot token, so the user ID in it is genuine; we attach
// that Telegram account to the signed-in customer with no extra steps.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "CUSTOMER") return NextResponse.json({ result: "unauthorized" }, { status: 401 });

  const token = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN;
  if (!token || !isSupabaseConfigured()) return NextResponse.json({ result: "not-configured" }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { initData?: unknown };
  const initData = typeof body.initData === "string" ? body.initData.slice(0, 4096) : "";
  const verified = verifyMiniAppInitData(initData, token);
  if (!verified.ok) return NextResponse.json({ result: "invalid" }, { status: 400 });

  const customer = await getCustomer(session.userId);
  if (customer?.telegramId === verified.telegramId) return NextResponse.json({ result: "already" });

  const result = await attachTelegram(session.userId, verified.telegramId);
  return NextResponse.json({ result }, { status: result === "error" ? 500 : 200 });
}
