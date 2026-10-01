"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCustomer } from "../data";
import { formatPhone, normalizePhone } from "../phone";
import { getSession } from "../session";
import { supabaseAdmin } from "../supabase/admin";
import { createClient } from "../supabase/server";
import { isValidUpiId, normalizePaymentRef, normalizeUpiId } from "../upi";
import { friendlyError, text, type FormState } from "./shared";

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
  const phone = normalizePhone(text(formData, "phone"));
  if (!phone) return { error: "Enter a valid mobile number, like 98765 43210." };

  const customer = await getCustomer(session.userId);
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
  const ref = normalizePaymentRef(text(formData, "ref"));
  if (!ref) return { error: friendlyError({ message: "invalid_reference" }) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("report_payment", { p_order: orderId, p_ref: ref });
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

  const name = text(formData, "name");
  const upiId = text(formData, "upiId");
  const upiName = text(formData, "upiName") || name;
  const price = Number(text(formData, "price"));
  if (name.length < 2 || name.length > 80) return { error: "Enter your business name." };
  if (!isValidUpiId(upiId)) return { error: "Enter a valid UPI ID, like yourshop@okaxis." };
  if (!(price > 0 && price <= 10_000)) return { error: "Enter your price per kg in rupees." };

  const { error } = await supabaseAdmin().rpc("register_business", {
    p_user: session.userId,
    p_name: name,
    p_upi_id: normalizeUpiId(upiId),
    p_upi_name: upiName.slice(0, 50),
    p_price: price,
  });
  if (error) return { error: friendlyError(error) };

  // The new role lives in the JWT, so mint a fresh session before entering the manager portal.
  const supabase = await createClient();
  await supabase.auth.refreshSession();
  redirect("/admin/business?welcome=1");
}
