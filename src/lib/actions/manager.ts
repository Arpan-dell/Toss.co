"use server";

import { revalidatePath } from "next/cache";
import { geocodeStore } from "../dispatch/service";
import { parseKg, repriceForWeight } from "../dispatch/weighing";
import { sortedTotal } from "../sorting";
import { notifyClosureRequested, notifySubscriptionSubmitted } from "../email/notify";
import { sendInvoice } from "../invoice/service";
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

// Service area: where the store is (a pin the manager places or their current location) and how far it picks
// up (1-20 km). `listed` puts the business in the public "Find a laundry" directory.
export async function updateServiceArea(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireManager();
  const lat = Number(text(formData, "lat"));
  const lng = Number(text(formData, "lng"));
  const radius = Number(text(formData, "radius"));
  const listed = formData.get("listed") === "on";
  if (!(Number.isInteger(radius) && radius >= 1 && radius <= 20)) return { error: "Choose a radius between 1 and 20 km." };
  const hasPin = Number.isFinite(lat) && Number.isFinite(lng) && text(formData, "lat") !== "";
  if (hasPin && !(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return { error: "That store location doesn't look right." };
  if (listed && !hasPin) return { error: "Place your store on the map first, so customers nearby can find you." };

  // Not in the manager's column grants: written server-side after the role check.
  const { error } = await supabaseAdmin()
    .from("tenants")
    .update({ service_radius_km: radius, listed, ...(hasPin ? { store_lat: lat, store_lng: lng } : {}) })
    .eq("id", session.tenantId);
  if (error) return { error: friendlyError(error) };
  done();
  revalidatePath("/laundries");
  return {
    message: listed
      ? `Saved. Customers within ${radius} km of your store can find you under Find a laundry.`
      : `Saved. You pick up within ${radius} km and stay hidden from Find a laundry.`,
  };
}

// Weigh at pickup: when on, drivers must enter the scale reading before a pickup completes, and that weight is
// billed. Off: "Picked up" completes with the basket's own reading.
export async function updateWeighing(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireManager();
  const on = formData.get("weighAtPickup") === "on";
  // whites and coloured bags are weighed separately, so sorting needs weighing on
  const sort = on && formData.get("sortWhites") === "on";
  // not in the manager's column grants: written server-side after the role check
  const { error } = await supabaseAdmin().from("tenants").update({ weigh_at_pickup: on, sort_whites: sort }).eq("id", session.tenantId);
  if (error) return { error: friendlyError(error) };
  done();
  if (!on) return { message: "Saved. Pickups use the basket's reading." + (formData.get("sortWhites") === "on" ? " Sorting whites needs weighing at pickup, so it's off too." : "") };
  return { message: sort ? "Saved. Drivers will bag whites and coloured clothes separately and weigh each bag." : "Saved. Drivers will weigh every bag at pickup." };
}

// The manager confirms or corrects an unpaid order's weight (e.g. weighed again at the store). Re-priced at
// the order's own rate, discount re-applied; the basket's original reading is kept.
export async function confirmOrderWeight(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireManager();
  const orderId = text(formData, "orderId");
  // sorted orders are corrected bag by bag (whites + coloured); others by total
  const split = formData.has("whites");
  const bag = (k: string) => {
    const v = text(formData, k);
    if (v === "" || v === "0") return 0;
    const n = parseKg(v);
    return n === null || n === "range" ? null : n;
  };
  const whites = split ? bag("whites") : 0;
  const coloured = split ? bag("coloured") : 0;
  if (whites === null || coloured === null) return { error: "Enter each bag's weight in kg (0 if there's none), up to 60." };
  const kg = split ? sortedTotal(whites, coloured) : parseKg(text(formData, "kg"));
  if (kg === null || kg === "range") return { error: split ? "At least one bag needs clothes." : "Enter the weight in kg, between 0.2 and 60." };

  // read through RLS first: only an order of this manager's own business is found
  const supabase = await createClient();
  const { data: o } = await supabase
    .from("orders")
    .select("id, weight_kg, amount_due, amount_gross, amount_before_discount, discount_pct, payment_status, reported_weight_kg, tenant_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!o || o.tenant_id !== session.tenantId) return { error: "Order not found in your business." };
  if (o.payment_status !== "UNPAID") return { error: "This order is already paid or being paid, so its amount is fixed." };
  const { data: t } = await supabase.from("tenants").select("price_per_kg").eq("id", session.tenantId).maybeSingle();

  const priced = repriceForWeight(
    {
      weightKg: Number(o.weight_kg) || 0,
      // price before basket credit: the database takes the credit off again after repricing
      amountDue: Number(o.amount_gross ?? o.amount_due) || 0,
      amountBeforeDiscount: o.amount_before_discount as number | null,
      discountPct: o.discount_pct as number | null,
    },
    kg,
    Number(t?.price_per_kg) || 0,
  );
  const { data: saved, error } = await supabaseAdmin()
    .from("orders")
    .update({
      weight_kg: kg,
      weighed_kg: kg,
      weighed_at: new Date().toISOString(),
      weight_source: "manager",
      reported_weight_kg: o.reported_weight_kg ?? o.weight_kg,
      whites_kg: split ? whites : null,
      coloured_kg: split ? coloured : null,
      amount_due: priced.amountDue,
      amount_before_discount: priced.amountBeforeDiscount,
    })
    .eq("id", orderId)
    .eq("tenant_id", session.tenantId)
    .eq("payment_status", "UNPAID")
    .select("id");
  if (error || !saved?.length) return { error: error ? friendlyError(error) : "This order can't be changed anymore." };
  done();
  return { message: `Weight confirmed: ${kg} kg, ₹${priced.amountDue}.` };
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

// Once a payment is confirmed, the customer gets their invoice PDF by email and in the Toss Control bot.
export async function confirmPayment(formData: FormData) {
  const orderId = text(formData, "orderId");
  await updateOrder(orderId, { payment_status: "PAID", payment_confirmed_at: new Date().toISOString() });
  await sendInvoice(orderId);
}

export async function rejectPayment(formData: FormData) {
  await updateOrder(text(formData, "orderId"), { payment_status: "UNPAID", payment_method: null, payment_ref: null });
}

export async function markPaidCash(formData: FormData) {
  const orderId = text(formData, "orderId");
  await updateOrder(orderId, {
    payment_status: "PAID",
    payment_method: "CASH",
    payment_confirmed_at: new Date().toISOString(),
  });
  await sendInvoice(orderId);
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
