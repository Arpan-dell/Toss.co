"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "../session";
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
  if (name.length < 2 || name.length > 80) return { error: "Enter your business name." };
  if (!isValidUpiId(upiId)) return { error: "Enter a valid UPI ID, like yourshop@okaxis." };
  if (!(price > 0 && price <= 10_000)) return { error: "Enter your price per kg in rupees." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({ name, upi_id: normalizeUpiId(upiId), upi_name: upiName.slice(0, 50), price_per_kg: price })
    .eq("id", session.tenantId);
  if (error) return { error: friendlyError(error) };
  done();
  return { message: "Saved. New orders use the new price; customers pay to the new UPI ID." };
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
  await requireManager();
  const months = Number(text(formData, "months"));
  const ref = normalizePaymentRef(text(formData, "ref"));
  if (!ref) return { error: friendlyError({ message: "invalid_reference" }) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_subscription_payment", { p_months: months, p_ref: ref });
  if (error) return { error: friendlyError(error) };
  done("/admin/billing");
  return { message: "Payment submitted. Your plan is extended as soon as Toss confirms it." };
}
