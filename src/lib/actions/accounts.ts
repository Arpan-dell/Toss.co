"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { monthRangeIST } from "../accounts";
import { getTenantById } from "../data";
import { normalizePhone } from "../phone";
import { planState, tierOf } from "../plan";
import { getSession } from "../session";
import { createClient } from "../supabase/server";
import { normalizePaymentRef } from "../upi";
import { friendlyError, text, type FormState } from "./shared";

// Business accounts (Toss Pro): PGs, hostels and offices billed once a month for all their baskets. Writes run as
// the manager, so RLS keeps them to their business; the Pro check is repeated because a page gate alone doesn't
// stop a direct request.

async function requireProManager() {
  const session = await getSession();
  if (!session || session.role !== "MANAGER" || !session.tenantId) throw new Error("Not a manager");
  const tenant = await getTenantById(session.tenantId);
  if (!tenant || tierOf(planState(tenant).state) !== "PRO") return null;
  return session;
}
const notPro: FormState = { error: "Business accounts are a Toss Pro feature. Upgrade under Billing." };
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function saveAccount(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireProManager();
  if (!session) return notPro;
  const id = text(fd, "id");
  const name = text(fd, "name").slice(0, 80);
  const contactName = text(fd, "contactName").slice(0, 80) || null;
  const phoneRaw = text(fd, "phone");
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const email = text(fd, "email").toLowerCase() || null;
  const priceRaw = text(fd, "pricePerKg");
  const price = priceRaw === "" ? null : Number(priceRaw);
  if (name.length < 2) return { error: "Give the account a name, like the PG or hostel's name." };
  if (phoneRaw && !phone) return { error: "Enter a valid mobile number." };
  if (email && (!EMAIL.test(email) || email.length > 200)) return { error: "Enter a valid email address." };
  if (price !== null && !(price > 0 && price <= 10_000)) return { error: "Price per kg must be more than ₹0, or empty to use your normal price." };

  const row = { name, contact_name: contactName, phone, email, price_per_kg: price };
  const supabase = await createClient();
  if (id) {
    const { data, error } = await supabase.from("business_accounts").update(row).eq("id", id).select("id");
    if (error || !data?.length) return { error: error ? friendlyError(error) : "Account not found." };
    revalidatePath("/admin/accounts", "layout");
    return { message: "Saved. A new price applies to pickups from now on." };
  }
  const { data, error } = await supabase.from("business_accounts").insert({ ...row, tenant_id: session.tenantId! }).select("id").single();
  if (error) return { error: friendlyError(error) };
  redirect(`/admin/accounts/${encodeURIComponent(data.id as string)}`);
}

export async function deleteAccount(fd: FormData) {
  if (!(await requireProManager())) return;
  const supabase = await createClient();
  // baskets and past pickups keep working; they just stop going on this account's bill
  await supabase.from("business_accounts").delete().eq("id", text(fd, "id"));
  revalidatePath("/admin/accounts", "layout");
  redirect("/admin/accounts");
}

// Puts a basket on an account (or takes it off with an empty accountId). New pickups follow; past ones stay.
export async function setBasketAccount(fd: FormData) {
  if (!(await requireProManager())) return;
  const deviceId = text(fd, "deviceId");
  const accountId = text(fd, "accountId") || null;
  const supabase = await createClient();
  if (accountId) {
    // RLS: only this business's accounts are visible, so another laundry's account ID can't be used
    const { data } = await supabase.from("business_accounts").select("id").eq("id", accountId).maybeSingle();
    if (!data) return;
  }
  await supabase.from("devices").update({ account_id: accountId }).eq("device_id", deviceId);
  revalidatePath("/admin", "layout");
}

// The account paid its bill for a month: every unpaid pickup of that month is marked paid with one reference.
export async function settleMonth(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await requireProManager())) return notPro;
  const accountId = text(fd, "accountId");
  const range = monthRangeIST(text(fd, "month"));
  const method = text(fd, "method");
  if (!range || !["UPI", "CASH", "OTHER"].includes(method)) return { error: "Choose how the bill was paid." };
  const refRaw = text(fd, "ref");
  const ref = method === "UPI" ? normalizePaymentRef(refRaw) : refRaw.slice(0, 40) || null;
  if (method === "UPI" && !ref) return { error: friendlyError({ message: "invalid_reference" }) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .update({ payment_status: "PAID", payment_method: method, payment_ref: ref, payment_confirmed_at: new Date().toISOString() })
    .eq("account_id", accountId)
    .eq("status", "COMPLETED")
    .in("payment_status", ["UNPAID", "PENDING"])
    .gte("completed_at", range.start)
    .lt("completed_at", range.end)
    .select("id");
  if (error) return { error: friendlyError(error) };
  revalidatePath("/admin", "layout");
  return { message: data?.length ? `Marked ${data.length} pickup${data.length === 1 ? "" : "s"} as paid.` : "Nothing left to pay for that month." };
}
