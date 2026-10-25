import "server-only";
import { normalizePhone } from "./phone";
import { countryOf } from "./regions";
import { supabaseAdmin } from "./supabase/admin";

/**
 * The mobile number to pre-fill on a payment page, so the gateway doesn't ask for it (Indian gateways must collect
 * one). The account's saved number first, then the one given at sign-up; none if the person signed in with Google
 * and never added one (Billing then asks once and saves it).
 */
export async function payerPhone(userId: string, country?: string | null): Promise<string | undefined> {
  const db = supabaseAdmin();
  const { data: me } = await db.from("customers").select("phone").eq("id", userId).maybeSingle();
  if (me?.phone) return me.phone as string;
  const { data } = await db.auth.admin.getUserById(userId).catch(() => ({ data: { user: null } }));
  const user = data.user;
  const raw = (user?.phone ? `+${user.phone.replace(/^\+/, "")}` : "") || (typeof user?.user_metadata?.phone === "string" ? (user.user_metadata.phone as string) : "");
  return raw ? (normalizePhone(raw, countryOf(country).dial || "91") ?? undefined) : undefined;
}
