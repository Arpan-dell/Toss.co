import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { logError } from "./log";
import { SITE_URL } from "./site";
import { isSupabaseConfigured, supabaseAdmin } from "./supabase/admin";

// Unsubscribing from optional emails. Service emails (invoices, password resets, payment and account notices)
// always go out; these categories are the optional ones. Every optional email carries a signed link (and the
// List-Unsubscribe headers mail apps use for their own "Unsubscribe" button), so nobody needs to sign in to stop it.

export const EMAIL_CATEGORIES = {
  reminders: "reminders (plan renewals and unpaid bills)",
  alerts: "alerts (low stock and late orders)",
} as const;
export type EmailCategory = keyof typeof EMAIL_CATEGORIES;

const secret = () => process.env.UNSUBSCRIBE_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const b64 = (s: string) => Buffer.from(s).toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString();
const sign = (email: string, category: string) => createHmac("sha256", secret()).update(`unsubscribe|${email.toLowerCase()}|${category}`).digest("base64url").slice(0, 32);

export function unsubscribeUrl(email: string, category: EmailCategory): string {
  return `${SITE_URL}/unsubscribe?e=${b64(email.toLowerCase())}&c=${category}&t=${sign(email, category)}`;
}

/** The email and category from a link, if its signature is right. */
export function readUnsubscribeLink(e?: string, c?: string, t?: string): { email: string; category: EmailCategory } | null {
  if (!e || !c || !t || !(c in EMAIL_CATEGORIES) || !secret()) return null;
  let email: string;
  try {
    email = unb64(e);
  } catch {
    return null;
  }
  const want = Buffer.from(sign(email, c)), got = Buffer.from(t);
  return want.length === got.length && timingSafeEqual(want, got) ? { email, category: c as EmailCategory } : null;
}

export async function optOut(email: string, categories: (EmailCategory | "all")[]): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const db = supabaseAdmin();
  const { data } = await db.from("email_optouts").select("categories").eq("email", email.toLowerCase()).maybeSingle();
  const merged = [...new Set([...((data?.categories as string[]) ?? []), ...categories])];
  const { error } = await db.from("email_optouts").upsert({ email: email.toLowerCase(), categories: merged, updated_at: new Date().toISOString() });
  if (error) logError("unsubscribe failed", error.message);
  return !error;
}

/** Whether this address has turned this kind of email off. Fails open (sends) if the list can't be read. */
export async function isOptedOut(email: string, category: EmailCategory): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const { data, error } = await supabaseAdmin().from("email_optouts").select("categories").eq("email", email.toLowerCase()).maybeSingle();
  if (error) {
    logError("opt-out check failed", error.message);
    return false;
  }
  const cats = (data?.categories as string[] | undefined) ?? [];
  return cats.includes(category) || cats.includes("all");
}
