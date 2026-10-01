import "server-only";
import { supabaseAdmin } from "./supabase/admin";

export type LinkResult = "linked" | "taken" | "error";

// Attaches a verified Telegram account to a Toss customer: link_telegram() sets telegram_id and
// pulls in every order and basket that Telegram ID already owns. When Telegram also shared the
// account's phone number, it becomes the customer's verified number (unless another account owns it).
export async function attachTelegram(customerId: string, telegramId: string, verifiedPhone?: string): Promise<LinkResult> {
  const admin = supabaseAdmin();
  const { error } = await admin.rpc("link_telegram", { p_customer: customerId, p_telegram_id: telegramId });
  if (error) {
    if (error.message.includes("telegram_already_linked")) return "taken";
    console.error("link_telegram failed", error);
    return "error";
  }

  if (verifiedPhone) {
    const { error: phoneError } = await admin
      .from("customers")
      .update({ phone: verifiedPhone, phone_verified: true })
      .eq("id", customerId);
    // 23505: the number belongs to another account. Linking still succeeded; keep their typed number.
    if (phoneError && phoneError.code !== "23505") console.error("saving verified phone failed", phoneError);
  }
  return "linked";
}
