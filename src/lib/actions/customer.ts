"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCustomer, getTenantById } from "../data";
import { formatPhone, normalizePhone } from "../phone";
import { notifyBusinessRegistered } from "../email/notify";
import { getSession } from "../session";
import { supabaseAdmin } from "../supabase/admin";
import { createClient } from "../supabase/server";
import { isValidUpiId, normalizePaymentRef, normalizeUpiId } from "../upi";
import { friendlyError, text, type FormState } from "./shared";
import { pricePerKgFrom } from "../region-format";
import { countryOf } from "../regions";
import { readPrefs } from "../prefs";

async function requireCustomer() {
  const session = await getSession();
  if (!session || session.role !== "CUSTOMER") throw new Error("Not a customer");
  return session;
}

// Customer enters a laundry's Business ID; their baskets and past orders follow them in.
export async function joinBusiness(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireCustomer();
  const code = text(formData, "code").toUpperCase();
  if (!/^B-[A-Z0-9]{6}$/.test(code)) return { error: "A Business ID looks like B-7K2Q9M." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_tenant", { p_code: code });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/app", "layout");
  return { message: `You're now connected to ${(data as { name: string }).name}.` };
}

// Sets or changes the customer's mobile number. A new number is unverified until Telegram confirms it.
export async function updatePhone(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireCustomer();
  const customer = await getCustomer(session.userId);
  // numbers without a country code are read as the laundry's country (India until they join one)
  const country = countryOf((await getTenantById(customer?.tenantId))?.country);
  const phone = normalizePhone(text(formData, "phone"), country.dial || "91");
  if (!phone) return { error: country.code === "IN" ? "Enter a valid mobile number, like 98765 43210." : "Enter a valid mobile number, with the country code if it's from another country." };

  if (customer?.phone === phone) return { message: "That's already your number." };

  const { error } = await supabaseAdmin().from("customers").update({ phone, phone_verified: false }).eq("id", session.userId);
  if (error) {
    return { error: error.code === "23505" ? "That mobile number is already used by another Toss account." : friendlyError(error) };
  }
  revalidatePath("/app", "layout");
  return { message: `Saved. Your number is now ${formatPhone(phone)}.` };
}

// After paying in their UPI app, the customer submits the transaction reference for the manager to verify.
export async function reportPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireCustomer();
  const orderId = text(formData, "orderId");
  const method = (text(formData, "method") || "UPI").toUpperCase();
  const tip = Math.max(0, Math.round(Number(text(formData, "tip") || 0) * 100) / 100);
  // UPI's UTR is 6+ letters/digits; other methods' IDs vary, so only spaces and punctuation are dropped
  const ref = method === "UPI" ? normalizePaymentRef(text(formData, "ref")) : text(formData, "ref").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 35);
  if (!ref || ref.length < 4) return { error: friendlyError({ message: "invalid_reference" }) };
  if (!Number.isFinite(tip) || tip > 100_000) return { error: friendlyError({ message: "invalid_tip" }) };

  const supabase = await createClient();
  // UPI without a tip uses the original two arguments, which also work before migration 0035
  const args = method === "UPI" && !tip ? { p_order: orderId, p_ref: ref } : { p_order: orderId, p_ref: ref, p_method: method, p_tip: tip };
  const { error } = await supabase.rpc("report_payment", args);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/app", "layout");
  return { message: "Thanks! Your laundry will confirm the payment shortly." };
}

// Turns this account into the manager of a new laundry business (starts a free trial).
export async function registerBusiness(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireCustomer();
  const customer = await getCustomer(session.userId);
  if (customer?.tenantId) {
    return { error: "This account is a customer of a laundry. Use a separate email to register your own business." };
  }
  if (formData.get("consent") !== "yes") return { error: "Tick the box to agree to the Terms and Privacy Policy." };

  const name = text(formData, "name");
  const country = countryOf(text(formData, "country") || "IN");
  const india = country.code === "IN";
  const currency = (text(formData, "currency") || country.currency).toUpperCase();
  const unitRaw = text(formData, "unit");
  const unit = unitRaw === "lb" || unitRaw === "kg" ? unitRaw : country.unit;
  // India has one time zone (browsers may still say the old name, Asia/Calcutta)
  const timezone = india ? "Asia/Kolkata" : (validTimezone(text(formData, "timezone")) ?? country.timezone);
  const upiId = text(formData, "upiId");
  const upiName = text(formData, "upiName") || name;
  const price = Number(text(formData, "price"));
  if (name.length < 2 || name.length > 80) return { error: "Enter your business name." };
  if (!/^[A-Z]{3}$/.test(currency)) return { error: "Choose your currency." };
  if (india && !isValidUpiId(upiId)) return { error: "Enter a valid UPI ID, like yourshop@okaxis." };
  if (!(price > 0 && price <= 10_000)) return { error: `Enter your price per ${unit}.` };

  // An Indian business keeps the original call (it also works before migration 0035); others pass their region
  const plain = india && currency === "INR" && unit === "kg" && timezone === "Asia/Kolkata";
  const { data, error } = await supabaseAdmin().rpc(
    "register_business",
    plain
      ? { p_user: session.userId, p_name: name, p_upi_id: normalizeUpiId(upiId), p_upi_name: upiName.slice(0, 50), p_price: price }
      : {
          p_user: session.userId,
          p_name: name,
          p_upi_id: india ? normalizeUpiId(upiId) : "",
          p_upi_name: india ? upiName.slice(0, 50) : "",
          p_price: pricePerKgFrom(price, unit),
          p_country: country.code,
          p_currency: currency,
          p_timezone: timezone,
          p_weight_unit: unit,
        },
  );
  if (error) return { error: friendlyError(error) };
  await notifyBusinessRegistered((data as { tenant_id: string }).tenant_id);

  // The new role lives in the JWT, so mint a fresh session before entering the manager portal.
  const supabase = await createClient();
  await supabase.auth.refreshSession();
  redirect("/admin/business?welcome=1");
}

function validTimezone(tz: string): string | undefined {
  if (!tz || tz.length > 64) return undefined;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

// Laundry preferences (detergent, water, drying…), shown to the laundry with every pickup.
export async function savePrefs(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireCustomer();
  const prefs = readPrefs((k) => text(formData, k));
  const supabase = await createClient();
  const { error } = await supabase.from("customers").update({ prefs }).eq("id", session.userId);
  if (error) return { error: error.message.includes("prefs") ? "Preferences switch on shortly. Please try again later." : friendlyError(error) };
  revalidatePath("/app/settings");
  return { message: "Saved. Your laundry sees these with every pickup." };
}
