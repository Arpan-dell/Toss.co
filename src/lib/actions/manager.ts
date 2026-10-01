"use server";

import { revalidatePath } from "next/cache";
import { geocodeStore } from "../dispatch/service";
import { notifyClosureRequested, notifySubscriptionSubmitted } from "../email/notify";
import { getSession } from "../session";
import { supabaseAdmin } from "../supabase/admin";
import { createClient } from "../supabase/server";
import { isValidUpiId, normalizePaymentRef, normalizeUpiId } from "../upi";
import { friendlyError, text, type FormState } from "./shared";

// All writes run as the manager, so Postgres RLS and column grants confine them to their own
// business and to the payment/amount fields of its orders.
async function requireManager() {
  const session = await getSession();
  if (!session || session.role !== "MANAGER" || !session.tenantId) throw new Error("Not a manager");
  return session;
}

function done(path = "/admin") {
  revalidatePath(path, "layout");
}

export async function updateBusiness(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireManager();
  const name = text(formData, "name");
  const upiId = text(formData, "upiId");
  const upiName = text(formData, "upiName") || name;
  const price = Number(text(formData, "price"));
  const storeAddress = text(formData, "storeAddress");
  if (name.length < 2 || name.length > 80) return { error: "Enter your business name." };
  if (!isValidUpiId(upiId)) return { error: "Enter a valid UPI ID, like yourshop@okaxis." };
  if (!(price > 0 && price <= 10_000)) return { error: "Enter your price per kg in rupees." };
  if (storeAddress.length > 300) return { error: "That store address is too long." };

  const supabase = await createClient();
  const { data: before } = await supabase.from("tenants").select("store_address").eq("id", session.tenantId).maybeSingle();
  const { error } = await supabase
    .from("tenants")
    .update({ name, upi_id: normalizeUpiId(upiId), upi_name: upiName.slice(0, 50), price_per_kg: price, store_address: storeAddress || null })
    .eq("id", session.tenantId);
  if (error) return { error: friendlyError(error) };

  // Find the store on the map once per address change; drivers' routes end there.
  let located = true;
  if ((before?.store_address ?? "") !== storeAddress) located = !storeAddress || !!(await geocodeStore(session.tenantId!));
  done();
  return located
    ? { message: "Saved. New orders use the new price; customers pay to the new UPI ID." }
    : { message: "Saved, but we couldn't find the store address on the map. Drivers' routes will search it by text. Try adding the area and city." };
}

// Win-back offers: after `days` without a pickup, the customer gets `pct`% off their next one.
export async function updateWinback(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireManager();
  const enabled = formData.get("enabled") === "on";
  const days = Number(text(formData, "days"));
  const pct = Number(text(formData, "pct"));
  if (!(Number.isInteger(days) && days >= 7 && days <= 365)) return { error: "Choose between 7 and 365 days." };
  if (!(Number.isInteger(pct) && pct >= 1 && pct <= 50)) return { error: "Choose a discount between 1% and 50%." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({ winback_enabled: enabled, winback_days: days, winback_pct: pct })
    .eq("id", session.tenantId);
  if (error) return { error: friendlyError(error) };
  done();
  return {
    message: enabled
      ? `Saved. Customers with no pickup for ${days} days get ${pct}% off their next one, announced in the Toss Control bot.`
      : "Saved. Win-back offers are off.",
  };
}

async function updateOrder(orderId: string, patch: Record<string, unknown>) {
  await requireManager();
  const supabase = await createClient();
  const { data, error } = await supabase.from("orders").update(patch).eq("id", orderId).select("id");
  if (error || !data?.length) throw new Error(error?.message ?? "Order not found in your business");
  done();
}

export async function confirmPayment(formData: FormData) {
  await updateOrder(text(formData, "orderId"), { payment_status: "PAID", payment_confirmed_at: new Date().toISOString() });
}

export async function rejectPayment(formData: FormData) {
  await updateOrder(text(formData, "orderId"), { payment_status: "UNPAID", payment_method: null, payment_ref: null });
}

export async function markPaidCash(formData: FormData) {
  await updateOrder(text(formData, "orderId"), {
    payment_status: "PAID",
    payment_method: "CASH",
    payment_confirmed_at: new Date().toISOString(),
  });
}

export async function setOrderAmount(_prev: FormState, formData: FormData): Promise<FormState> {
  const amount = Math.round(Number(text(formData, "amount")));
  if (!(amount >= 0 && amount <= 1_000_000)) return { error: "Enter an amount in rupees." };
  try {
    await updateOrder(text(formData, "orderId"), { amount_due: amount });
  } catch (err) {
    return { error: friendlyError(err as Error) };
  }
  return { message: "Amount updated." };
}

// After paying the Toss owner's UPI ID, the manager submits the reference for approval.
export async function submitSubscriptionPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireManager();
  const months = Number(text(formData, "months"));
  const ref = normalizePaymentRef(text(formData, "ref"));
  if (!ref) return { error: friendlyError({ message: "invalid_reference" }) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_subscription_payment", { p_months: months, p_ref: ref });
  if (error) return { error: friendlyError(error) };
  await notifySubscriptionSubmitted(session.tenantId!, ref);
  done("/admin/billing");
  return { message: "Payment submitted. Your plan is extended as soon as Toss confirms it. We've emailed you a receipt." };
}

// The manager asks Toss to close their business. Recorded on the business and emailed to the owner,
// who completes it; nothing is deleted automatically.
export async function requestClosure(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireManager();
  const reason = text(formData, "reason").slice(0, 500);
  if (formData.get("confirm") !== "on") return { error: "Tick the box to confirm you want to close your business." };
  const { error } = await supabaseAdmin()
    .from("tenants")
    .update({ closure_requested_at: new Date().toISOString(), closure_reason: reason || null })
    .eq("id", session.tenantId!);
  if (error) return { error: friendlyError(error) };
  await notifyClosureRequested(session.tenantId!, reason);
  done();
  return { message: "Request sent. Toss will contact you by email to complete it." };
}
