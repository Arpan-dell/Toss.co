"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "../session";
import { supabaseAdmin } from "../supabase/admin";
import { isValidUpiId, normalizeUpiId } from "../upi";
import { friendlyError, text, type FormState } from "./shared";

// Owner actions cross businesses, so they run with the service role, but only after checking
// that the caller's verified JWT says role = owner.
async function requireOwner() {
  const session = await getSession();
  if (!session || session.role !== "OWNER") throw new Error("Not the owner");
  return session;
}

export async function updatePlatformSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireOwner();
  const monthlyPrice = Number(text(formData, "monthlyPrice"));
  const trialDays = Number(text(formData, "trialDays"));
  const upiId = text(formData, "ownerUpiId");
  const upiName = text(formData, "ownerUpiName") || "Toss";
  if (!(monthlyPrice >= 0 && monthlyPrice <= 1_000_000)) return { error: "Enter a monthly price in rupees." };
  if (!(Number.isInteger(trialDays) && trialDays >= 0 && trialDays <= 365)) return { error: "Trial must be 0–365 days." };
  if (!isValidUpiId(upiId)) return { error: "Enter your UPI ID, like you@okaxis, so businesses can pay you." };

  const { error } = await supabaseAdmin()
    .from("platform_settings")
    .update({ monthly_price: monthlyPrice, trial_days: trialDays, owner_upi_id: normalizeUpiId(upiId), owner_upi_name: upiName.slice(0, 50) })
    .eq("id", 1);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { message: "Saved. New trials and subscription payments use these settings." };
}

export async function reviewSubscriptionPayment(formData: FormData) {
  await requireOwner();
  const id = Number(text(formData, "id"));
  const approve = text(formData, "decision") === "approve";
  const { error } = await supabaseAdmin().rpc("review_subscription_payment", { p_id: id, p_approve: approve });
  if (error) throw new Error(friendlyError(error));
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
  revalidatePath("/owner", "layout");
}
