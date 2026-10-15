"use server";

import { revalidatePath } from "next/cache";
import { invalidate, KEYS } from "../cache";
import { notifySubscriptionReviewed, notifySuspension } from "../email/notify";
import { checkPassword } from "../password-check";
import { getSession } from "../session";
import { supabaseAdmin } from "../supabase/admin";
import { endTrialNow, extendTrialBy } from "../trial";
import { createClient } from "../supabase/server";
import { friendlyError, text, type FormState } from "./shared";

// Owner actions cross businesses, so they run with the service role, but only after checking
// that the caller's verified JWT says role = owner.
async function requireOwner() {
  const session = await getSession();
  if (!session || session.role !== "OWNER") throw new Error("Not the owner");
  return session;
}

export async function updatePlatformSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireOwner();
  const monthlyPrice = Number(text(formData, "monthlyPrice"));
  const branchPrice = Number(text(formData, "branchPrice"));
  const trialDays = Number(text(formData, "trialDays"));
  if (!(monthlyPrice >= 0 && monthlyPrice <= 1_000_000)) return { error: "Enter a monthly price in rupees." };
  if (!(Number.isInteger(branchPrice) && branchPrice >= 0 && branchPrice <= 100_000)) return { error: "Enter a branch price in whole rupees." };
  if (!(Number.isInteger(trialDays) && trialDays >= 0 && trialDays <= 365)) return { error: "Trial must be 0–365 days." };
  const usdMonthly = Number(text(formData, "usdMonthlyPrice") || 0);
  const usdBranch = Number(text(formData, "usdBranchPrice") || 0);
  if (!(usdMonthly >= 0 && usdMonthly <= 10_000 && usdBranch >= 0 && usdBranch <= 10_000)) return { error: "Enter the US dollar prices." };
  const [d3, d6, d12] = ["discount3m", "discount6m", "discount12m"].map((k) => Number(text(formData, k)));
  if (![d3, d6, d12].every((d) => Number.isInteger(d) && d >= 0 && d <= 90)) return { error: "Discounts must be 0–90%." };
  // prices decide what every business pays: changing them needs your password
  const wrong = await checkPassword(session, String(formData.get("password") ?? ""));
  if (wrong) return { error: wrong };

  const base = { monthly_price: monthlyPrice, branch_price: branchPrice, trial_days: trialDays, discount_3m: d3, discount_6m: d6, discount_12m: d12 };
  // the dollar prices exist from migration 0035; until then only the rupee settings are saved
  const { data: cols } = await supabaseAdmin().from("platform_settings").select("*").eq("id", 1).maybeSingle();
  const intl = cols && "usd_monthly_price" in cols ? { usd_monthly_price: usdMonthly, usd_branch_price: usdBranch } : {};
  const { error } = await supabaseAdmin()
    .from("platform_settings")
    .update({ ...base, ...intl })
    .eq("id", 1);
  if (error) return { error: friendlyError(error) };
  await invalidate(KEYS.platformSettings, KEYS.publicPlan);
  revalidatePath("/", "layout");
  return { message: "Saved. New trials and subscription payments use these settings." };
}

export async function reviewSubscriptionPayment(formData: FormData) {
  await requireOwner();
  const id = Number(text(formData, "id"));
  const approve = text(formData, "decision") === "approve";
  const { error } = await supabaseAdmin().rpc("review_subscription_payment", { p_id: id, p_approve: approve });
  if (error) throw new Error(friendlyError(error));
  await notifySubscriptionReviewed(id);
  revalidatePath("/owner", "layout");
}

export async function setBusinessSuspended(formData: FormData) {
  await requireOwner();
  const tenantId = text(formData, "tenantId");
  const suspend = text(formData, "suspend") === "1";
  const { error } = await supabaseAdmin()
    .from("tenants")
    .update({ plan_status: suspend ? "SUSPENDED" : "ACTIVE" })
    .eq("id", tenantId);
  if (error) throw new Error(friendlyError(error));
  await notifySuspension(tenantId, suspend);
  revalidatePath("/owner", "layout");
}

// The owner's trial controls on the Businesses page (the logic is in lib/trial.ts, shared with the assistant).
export async function extendTrial(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireOwner();
  const days = Number(text(formData, "days"));
  try {
    await extendTrialBy(text(formData, "tenantId"), days);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't extend the trial." };
  }
  revalidatePath("/owner", "layout");
  revalidatePath("/admin", "layout");
  return { message: `Trial extended by ${days} day${days === 1 ? "" : "s"}. The manager has been emailed.` };
}

export async function endTrial(formData: FormData) {
  await requireOwner();
  await endTrialNow(text(formData, "tenantId"));
  revalidatePath("/owner", "layout");
  revalidatePath("/admin", "layout");
}

// ---------- basket credits ----------
export async function updateCreditSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireOwner();
  const n = (k: string) => Number(text(formData, k));
  const v = {
    basket_price: n("basketPrice"),
    basket_credit: n("basketCredit"),
    credit_per_kg: n("creditPerKg"),
    credit_max_pct: n("creditMaxPct"),
    credit_toss_share_pct: n("creditTossSharePct"),
    credit_sub_max_pct: n("creditSubMaxPct"),
    credit_valid_days: n("creditValidDays"),
  };
  const whole = (x: number, lo: number, hi: number) => Number.isInteger(x) && x >= lo && x <= hi;
  if (!whole(v.basket_price, 0, 100_000) || !whole(v.basket_credit, 0, 100_000)) return { error: "Basket price and credit must be whole rupees." };
  if (!(v.credit_per_kg >= 0 && v.credit_per_kg <= 1000)) return { error: "Credit per kg must be 0–1000." };
  if (![v.credit_max_pct, v.credit_toss_share_pct, v.credit_sub_max_pct].every((x) => whole(x, 0, 100))) return { error: "Percentages must be 0–100." };
  if (!whole(v.credit_valid_days, 1, 3650)) return { error: "Validity must be 1–3650 days." };
  const { error } = await supabaseAdmin().from("platform_settings").update(v).eq("id", 1);
  if (error) return { error: friendlyError(error) };
  await invalidate(KEYS.platformSettings, KEYS.publicPlan);
  revalidatePath("/", "layout");
  return { message: "Saved. New bills and grants use these settings." };
}

// Runs as the owner (not the service role): grant_basket_credit() checks the caller's JWT itself.
export async function grantBasketCredit(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireOwner();
  const code = text(formData, "customerCode").toUpperCase();
  const device = text(formData, "deviceId").slice(0, 64);
  const note = text(formData, "note").slice(0, 200);
  const amountRaw = text(formData, "amount");
  const amount = amountRaw ? Number(amountRaw) : null;
  if (!/^C-[A-Z0-9]{6}$/.test(code)) return { error: "Enter the customer's ID, like C-AB12CD (on their dashboard)." };
  if (amount !== null && !(Number.isFinite(amount) && amount > 0 && amount <= 100_000)) return { error: "Enter an amount in rupees." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("grant_basket_credit", { p_customer_code: code, p_device_id: device, p_amount: amount, p_note: note });
  if (error) return { error: error.message.includes("customer_not_found") ? "No customer with that ID." : friendlyError(error) };
  revalidatePath("/owner/credits");
  const r = data as { customer?: string; amount?: number };
  return { message: `Added ₹${r.amount} basket credit for ${r.customer ?? code}.` };
}
