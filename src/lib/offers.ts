import "server-only";
import { formatINR } from "./format";
import { APP_URL } from "./site";
import { supabaseAdmin } from "./supabase/admin";
import { esc, sendMessage, type InlineButton } from "./telegram-api";
import { logError } from "@/lib/log";

// Win-back discounts. A daily job offers a discount to customers who have gone quiet for longer than
// their laundry's win-back window; the next pickup they place gets it automatically. Both steps are
// SQL functions (migration 0010); this module runs them and tells the customer through the customer
// bot (send-only: the basket polls that bot, so the cloud never reads its updates).

const OPEN_TOSS: InlineButton[][] = [[{ text: "📱 Open Toss", web_app: { url: `${APP_URL}/app` } }]];

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

export async function tellCustomer(chatId: string, html: string) {
  const token = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN;
  if (!token) return false;
  try {
    await sendMessage(token, chatId, html, { inline: OPEN_TOSS });
    return true;
  } catch (err) {
    logError("offer message failed", err);
    return false;
  }
}

/** Creates today's win-back offers and announces them. Returns how many were created and sent. */
export async function runWinback(): Promise<{ created: number; notified: number }> {
  const db = supabaseAdmin();
  const { data, error } = await db.rpc("create_winback_offers");
  if (error) throw error;
  const offers = (data ?? []) as { offer_id: number; telegram_id: string | null; business: string; percent: number; expires_at: string }[];

  let notified = 0;
  for (const o of offers) {
    if (!o.telegram_id) continue; // they'll still see it on the website
    const sent = await tellCustomer(
      o.telegram_id,
      [
        `🎁 <b>We miss you!</b>`,
        `━━━━━━━━━━━━━━`,
        `Your next pickup from <b>${esc(o.business)}</b> is <b>${o.percent}% off</b>.`,
        ``,
        `🧺 Just fill your basket. Toss requests the pickup and the discount is applied automatically.`,
        `⏳ Valid until <b>${day(o.expires_at)}</b>.`,
      ].join("\n"),
    );
    if (sent) {
      notified++;
      await db.from("customer_offers").update({ notified_at: new Date().toISOString() }).eq("id", o.offer_id);
    }
  }
  return { created: offers.length, notified };
}

/** Applies the customer's open offer to a newly placed order and tells them. Never throws. */
export async function applyOfferToOrder(orderId: string): Promise<{ percent: number; before: number; after: number } | null> {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db.rpc("apply_customer_offer", { p_order: orderId });
    if (error) throw error;
    const applied = data as { percent: number; before: number; after: number } | null;
    if (!applied) return null;

    const { data: o } = await db.from("orders").select("device_order_id, customer_telegram_id").eq("id", orderId).maybeSingle();
    if (o?.customer_telegram_id) {
      await tellCustomer(
        o.customer_telegram_id as string,
        `🎁 <b>${applied.percent}% off applied!</b>\nPickup #${o.device_order_id}: <s>${formatINR(applied.before)}</s> → <b>${formatINR(applied.after)}</b>`,
      );
    }
    return applied;
  } catch (err) {
    logError("applying offer failed", err);
    return null;
  }
}
