"use server";

import { revalidatePath } from "next/cache";
import { geocodeStore, notifyWeighed } from "../dispatch/service";
import { parseKg, repriceForWeight } from "../dispatch/weighing";
import { sortedTotal } from "../sorting";
import { notifyClosureRequested } from "../email/notify";
import { sendInvoice } from "../invoice/service";
import { checkPassword } from "../password-check";
import { getSession } from "../session";
import { supabaseAdmin } from "../supabase/admin";
import { createClient } from "../supabase/server";
import { isValidUpiId, normalizeUpiId } from "../upi";
import { friendlyError, text, type FormState } from "./shared";
import { isBic, isUsername, isValidIban } from "../pay-methods";
import { pricePerKgFrom } from "../region-format";
import { countryOf } from "../regions";
import type { PayMethods } from "../types";
import { getTenantById } from "../data";

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

// Business page: the name and the store address.
export async function updateBusiness(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireManager();
  const name = text(formData, "name");
  const storeAddress = text(formData, "storeAddress");
  if (name.length < 2 || name.length > 80) return { error: "Enter your business name." };
  if (storeAddress.length > 300) return { error: "That store address is too long." };

  const supabase = await createClient();
  const { data: before } = await supabase.from("tenants").select("store_address, store_lat").eq("id", session.tenantId).maybeSingle();
  const { error } = await supabase.from("tenants").update({ name, store_address: storeAddress || null }).eq("id", session.tenantId);
  if (error) return { error: friendlyError(error) };

  // Find the store on the map once per address change; drivers' routes end there.
  let located = true;
  if ((before?.store_address ?? "") !== storeAddress || (storeAddress && before?.store_lat == null)) located = !storeAddress || !!(await geocodeStore(session.tenantId!));
  done();
  return located
    ? { message: "Saved." }
    : { message: "Saved, but we couldn't find the store address on the map. Drivers' routes will search it by text. Try adding the area and city." };
}

// Price & payments: where the business is, what customers pay and where the money goes. Needs the account
// password, like a bank would. Before migration 0035 only the original fields (price, UPI) exist, so only they're
// saved; the region fields are disabled on the form until then.
export async function updatePayments(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireManager();
  const supabase = await createClient();
  const { data: row } = await supabase.from("tenants").select("*").eq("id", session.tenantId).maybeSingle();
  if (!row) return { error: "Business not found." };
  const regionReady = row.country !== undefined;

  const country = regionReady ? countryOf(text(formData, "country") || (row.country as string)) : countryOf("IN");
  const india = country.code === "IN";
  const currency = regionReady ? (text(formData, "currency") || country.currency).toUpperCase() : "INR";
  const unitRaw = text(formData, "unit");
  const unit = regionReady && (unitRaw === "lb" || unitRaw === "kg") ? unitRaw : "kg";
  const price = Number(text(formData, "price"));
  const upiId = text(formData, "upiId");
  if (!(price > 0 && price <= 10_000)) return { error: `Enter your price per ${unit}.` };
  if (!/^[A-Z]{3}$/.test(currency)) return { error: "Choose your currency." };
  if ((india || upiId) && !isValidUpiId(upiId)) return { error: "Enter a valid UPI ID, like yourshop@okaxis." };

  const patch: Record<string, unknown> = {
    upi_id: upiId ? normalizeUpiId(upiId) : null,
    upi_name: (text(formData, "upiName") || (row.name as string) || "").slice(0, 50),
    price_per_kg: pricePerKgFrom(price, unit),
  };
  if (regionReady) {
    const methods = readPayMethods(formData);
    if (typeof methods === "string") return { error: methods };
    const tz = text(formData, "timezone");
    const minOrder = Number(text(formData, "minOrder") || 0);
    const taxPct = Number(text(formData, "taxPct") || 0);
    if (!(minOrder >= 0 && minOrder <= 100_000)) return { error: "Enter a minimum order of 0 or more." };
    if (!(taxPct >= 0 && taxPct <= 50)) return { error: "Tax must be between 0% and 50%." };
    Object.assign(patch, {
      country: country.code,
      currency,
      weight_unit: unit,
      timezone: india ? "Asia/Kolkata" : (validZone(tz) ?? country.timezone),
      min_order: minOrder,
      tax_label: text(formData, "taxLabel").slice(0, 30) || null,
      tax_pct: taxPct,
      tax_id: text(formData, "taxId").slice(0, 40) || null,
      pay_methods: methods,
    });
  }
  const wrong = await checkPassword(session, String(formData.get("password") ?? ""));
  if (wrong) return { error: wrong };

  const { error } = await supabase.from("tenants").update(patch).eq("id", session.tenantId);
  if (error) return { error: friendlyError(error) };
  done();
  return { message: "Saved. New pickups use this price, and customers see these ways to pay." };
}

function validZone(tz: string): string | undefined {
  if (!tz || tz.length > 64) return undefined;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

/** The payment methods from the form, checked, or a message saying which one is wrong. */
function readPayMethods(fd: FormData): PayMethods | string {
  const t = (k: string) => text(fd, k).trim();
  const out: PayMethods = { cash: fd.get("cash") === "yes" };
  const user = (k: "paypal" | "venmo" | "cashapp", label: string) => {
    const v = t(k).replace(/^[@$]/, "").replace(/^https?:\/\/(www\.)?(paypal\.me|venmo\.com|cash\.app)\/\$?/i, "");
    if (!v) return true;
    if (!isUsername(v)) return `${label}: enter just the username, like freshlaundry.`;
    out[k] = v;
    return true;
  };
  for (const [k, label] of [["paypal", "PayPal"], ["venmo", "Venmo"], ["cashapp", "Cash App"]] as const) {
    const r = user(k, label);
    if (r !== true) return r;
  }
  const email = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const phone = (v: string) => /^\+?[\d\s()-]{7,20}$/.test(v);
  if (t("zelle")) {
    if (!email(t("zelle")) && !phone(t("zelle"))) return "Zelle: enter the email or phone number registered with Zelle.";
    out.zelle = t("zelle");
  }
  if (t("interac")) {
    if (!email(t("interac"))) return "Interac: enter the email for e-Transfers.";
    out.interac = t("interac");
  }
  if (t("sepaIban") || t("sepaName")) {
    if (!isValidIban(t("sepaIban"))) return "That IBAN doesn't check out. Copy it again from your bank.";
    if (!t("sepaName")) return "Enter the account holder's name for SEPA transfers.";
    if (t("sepaBic") && !isBic(t("sepaBic"))) return "That BIC doesn't look right (8 or 11 letters and digits).";
    out.sepa = { name: t("sepaName").slice(0, 70), iban: t("sepaIban").replace(/\s+/g, "").toUpperCase(), bic: t("sepaBic").replace(/\s+/g, "").toUpperCase() || undefined };
  }
  if (t("bankAccount") || t("bankName")) {
    if (!t("bankAccount") || !t("bankName")) return "Bank transfer: enter both the account name and number.";
    out.bank = { name: t("bankName").slice(0, 70), account: t("bankAccount").slice(0, 40), code: t("bankCode").slice(0, 20) || undefined, codeLabel: t("bankCodeLabel").slice(0, 20) || undefined };
  }
  if (t("pixKey")) {
    if (!t("pixName") || !t("pixCity")) return "Pix: enter the name and city too (they're part of the Pix code).";
    out.pix = { key: t("pixKey").slice(0, 77), name: t("pixName").slice(0, 25), city: t("pixCity").slice(0, 15) };
  }
  if (t("paynow")) {
    if (!/^[A-Za-z0-9+\s-]{8,20}$/.test(t("paynow"))) return "PayNow: enter your UEN or mobile number.";
    out.paynow = t("paynow");
  }
  if (t("mpesaTill")) {
    if (!/^\d{5,10}$/.test(t("mpesaTill"))) return "M-Pesa: the till or paybill number is 5 to 10 digits.";
    out.mpesa = { till: t("mpesaTill"), account: t("mpesaAccount").slice(0, 20) || undefined };
  }
  if (t("gcash")) {
    if (!phone(t("gcash"))) return "GCash: enter the mobile number.";
    out.gcash = t("gcash");
  }
  if (t("linkUrl")) {
    if (!/^https:\/\/[^\s]{4,300}$/.test(t("linkUrl"))) return "The payment link must start with https://";
    out.link = { url: t("linkUrl"), label: t("linkLabel").slice(0, 30) || undefined };
  }
  return out;
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

// Where clothes are weighed: at the door (the driver enters the scale reading before a pickup completes), at the
// store (the driver just collects; the laundry enters the weight and the bill follows), or the basket's reading.
export async function updateWeighing(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireManager();
  const raw = text(formData, "weighAt");
  const weighAt = raw === "store" || raw === "basket" ? raw : "door";
  // whites and coloured bags are weighed separately by the driver, so sorting needs weighing at the door
  const sort = weighAt === "door" && formData.get("sortWhites") === "on";
  // not in the manager's column grants: written server-side after the role check
  const db = supabaseAdmin();
  let { error } = await db.from("tenants").update({ weigh_at: weighAt, weigh_at_pickup: weighAt === "door", sort_whites: sort }).eq("id", session.tenantId);
  if (error && /weigh_at/.test(error.message ?? "")) {
    if (weighAt === "store") return { error: "Weighing at the store switches on after the 0043 database update (Supabase → SQL Editor)." };
    ({ error } = await db.from("tenants").update({ weigh_at_pickup: weighAt === "door", sort_whites: sort }).eq("id", session.tenantId));
  }
  if (error) return { error: friendlyError(error) };
  done();
  const unsorted = formData.get("sortWhites") === "on" && !sort ? " Sorting whites needs weighing at the door, so it's off." : "";
  if (weighAt === "store") return { message: "Saved. Drivers just collect; weigh each bag at the store from your live board, and the customer gets the bill." + unsorted };
  if (weighAt === "basket") return { message: "Saved. Pickups use the basket's reading. Pickups booked without a basket are weighed at the store." + unsorted };
  return { message: sort ? "Saved. Drivers will bag whites and coloured clothes separately and weigh each bag." : "Saved. Drivers will weigh every bag at the door." };
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
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (!o || o.tenant_id !== session.tenantId) return { error: "Order not found in your business." };
  if (o.payment_status !== "UNPAID") return { error: "This order is already paid or being paid, so its amount is fixed." };
  const { data: t } = await supabase.from("tenants").select("*").eq("id", session.tenantId).maybeSingle();
  // a hostel or office on a monthly account has its own price per kg
  const { data: acct } = o.account_id ? await supabase.from("business_accounts").select("price_per_kg").eq("id", o.account_id as string).maybeSingle() : { data: null };

  const priced = repriceForWeight(
    {
      weightKg: Number(o.weight_kg) || 0,
      // price before basket credit: the database takes the credit off again after repricing
      amountDue: Number(o.amount_gross ?? o.amount_due) || 0,
      amountBeforeDiscount: o.amount_before_discount as number | null,
      discountPct: o.discount_pct as number | null,
    },
    kg,
    Number(acct?.price_per_kg) || Number(t?.price_per_kg) || 0,
    { currency: (t?.currency as string) ?? "INR", minOrder: Number(t?.min_order ?? 0) || 0 },
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
      // weighed at the store: the order can now be marked ready and paid
      ...(o.weigh_pending ? { weigh_pending: false } : {}),
    })
    .eq("id", orderId)
    .eq("tenant_id", session.tenantId)
    .eq("payment_status", "UNPAID")
    .select("id");
  if (error || !saved?.length) return { error: error ? friendlyError(error) : "This order can't be changed anymore." };
  if (o.weigh_pending) await notifyWeighed(orderId).catch(() => {});
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

// The money arrived in the laundry's UPI app or bank (no gateway connected): one tap, nothing to type.
export async function markPaidReceived(formData: FormData) {
  const session = await requireManager();
  const orderId = text(formData, "orderId");
  const t = await getTenantById(session.tenantId);
  await updateOrder(orderId, {
    payment_status: "PAID",
    payment_method: (t?.currency ?? "INR") === "INR" ? "UPI" : "OTHER",
    payment_confirmed_at: new Date().toISOString(),
  });
  await sendInvoice(orderId);
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
  // cents are kept (dollars, euros); rupees are typed in whole numbers anyway
  const amount = Math.round(Number(text(formData, "amount")) * 100) / 100;
  if (!(amount >= 0 && amount <= 1_000_000)) return { error: "Enter the amount." };
  try {
    await updateOrder(text(formData, "orderId"), { amount_due: amount });
  } catch (err) {
    return { error: friendlyError(err as Error) };
  }
  return { message: "Amount updated." };
}

// The manager asks Toss to close their business. Recorded on the business and emailed to the owner,
// who completes it; nothing is deleted automatically.
export async function requestClosure(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireManager();
  const reason = text(formData, "reason").slice(0, 500);
  if (formData.get("confirm") !== "on") return { error: "Tick the box to confirm you want to close your business." };
  const wrong = await checkPassword(session, String(formData.get("password") ?? ""));
  if (wrong) return { error: wrong };
  const { error } = await supabaseAdmin()
    .from("tenants")
    .update({ closure_requested_at: new Date().toISOString(), closure_reason: reason || null })
    .eq("id", session.tenantId!);
  if (error) return { error: friendlyError(error) };
  await notifyClosureRequested(session.tenantId!, reason);
  done();
  return { message: "Request sent. Toss will contact you by email to complete it." };
}
