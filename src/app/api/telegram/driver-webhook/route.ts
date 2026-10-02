import { timingSafeEqual } from "node:crypto";
import { handleDriverUpdate } from "@/lib/dispatch/service";
import { logError } from "@/lib/log";

// Telegram calls this for every message/button/location sent to the driver bot (set with setWebhook).
// Telegram echoes our secret in X-Telegram-Bot-Api-Secret-Token, so nobody else can post fake updates.
export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_DRIVER_WEBHOOK_SECRET ?? "";
  const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!expected || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    await handleDriverUpdate(await request.json());
  } catch (err) {
    // Always 200: a failing update would otherwise be retried by Telegram over and over.
    logError("driver webhook failed", err);
  }
  return Response.json({ ok: true });
}
