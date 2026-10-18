"use server";

import { revalidatePath } from "next/cache";
import { createStripeWebhook, deleteStripeWebhook, testKeys, type GatewayKeys, type Provider } from "../gateways";
import { platformToken, refreshIntent, setAutopay, startCardSetup, startOrderPayment, startSubscriptionPayment, webhookUrl } from "../gateway-payments";
import { checkPassword } from "../password-check";
import { getPlatformSettings, getTenantById, getTenantCreditBalance } from "../data";
import { subscriptionQuote, withBasketCredit } from "../pricing";
import { subscriptionCurrency } from "../region-format";
import { open, seal } from "../secret-box";
import { getSession } from "../session";
import { supabaseAdmin } from "../supabase/admin";
import { text, type FormState } from "./shared";

async function requireManager() {
  const session = await getSession();
  if (!session || session.role !== "MANAGER" || !session.tenantId) throw new Error("Not a manager");
  return session;
}

const done = () => {
  revalidatePath("/admin", "layout");
  revalidatePath("/app", "layout");
};

/**
 * Connects the laundry's own Razorpay or Stripe account. Razorpay: key ID + key secret first; Toss then shows the
 * webhook URL to add in Razorpay, and the webhook secret completes it. Stripe: the secret key is enough; Toss
 * registers its webhook on the account itself. Keys are checked with the gateway and stored encrypted.
 */
export async function connectGateway(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireManager();
  const wrong = await checkPassword(session, String(fd.get("password") ?? ""));
  if (wrong) return { error: wrong };
  const provider = text(fd, "provider") as Provider;
  if (provider !== "razorpay" && provider !== "stripe") return { error: "Choose Razorpay or Stripe." };
  const db = supabaseAdmin();
  const { data: existing, error: tableErr } = await db.from("tenant_gateways").select("*").eq("tenant_id", session.tenantId).maybeSingle();
  if (tableErr) return { error: "Online payments switch on after the next database update. Please try again later." };

  // Razorpay, second step: only the webhook secret is new
  const webhookSecret = text(fd, "webhookSecret");
  if (provider === "razorpay" && existing?.provider === "razorpay" && !text(fd, "secret") && webhookSecret) {
    if (webhookSecret.length < 8) return { error: "Paste the webhook secret you typed in Razorpay." };
    await db.from("tenant_gateways").update({ webhook_secret_enc: seal(webhookSecret) }).eq("tenant_id", session.tenantId);
    done();
    return { message: "Webhook added. Payments now confirm the moment they're made, even if the customer closes the page." };
  }

  const keys: GatewayKeys = { provider, keyId: text(fd, "keyId") || undefined, secret: text(fd, "secret") };
  if (!keys.secret) return { error: provider === "razorpay" ? "Paste your Razorpay key secret." : "Paste your Stripe secret key." };
  let live: boolean;
  try {
    ({ live } = await testKeys(keys));
  } catch (err) {
    return { error: err instanceof Error ? err.message.replace(/^(Razorpay|Stripe): /, `${provider === "razorpay" ? "Razorpay" : "Stripe"} said: `) : "Those keys didn't work." };
  }

  // a new connection replaces the old one (and its Stripe webhook)
  if (existing?.provider === "stripe" && existing.webhook_endpoint_id) {
    await deleteStripeWebhook({ provider: "stripe", secret: open(existing.secret_enc as string) }, existing.webhook_endpoint_id as string);
  }
  const { data: row, error } = await db
    .from("tenant_gateways")
    .upsert(
      { tenant_id: session.tenantId, provider, key_id: keys.keyId ?? null, secret_enc: seal(keys.secret), webhook_secret_enc: null, webhook_endpoint_id: null, live, connected_at: new Date().toISOString() },
      { onConflict: "tenant_id" },
    )
    .select("webhook_token")
    .single();
  if (error || !row) return { error: "Couldn't save the connection. Try again." };

  if (provider === "stripe") {
    try {
      const hook = await createStripeWebhook(keys, webhookUrl("stripe", row.webhook_token as string));
      await db.from("tenant_gateways").update({ webhook_secret_enc: seal(hook.secret), webhook_endpoint_id: hook.id }).eq("tenant_id", session.tenantId);
    } catch (err) {
      return { error: `Stripe accepted the key but Toss couldn't add its webhook: ${err instanceof Error ? err.message : "unknown error"}. A restricted key needs write access to Webhook Endpoints and Checkout Sessions.` };
    }
    await db.from("tenants").update({ online_gateway: "stripe" }).eq("id", session.tenantId);
    done();
    return { message: `Stripe is connected${live ? "" : " in test mode (no real money)"}. Customers now pay online and payments confirm themselves.` };
  }
  // Razorpay: live straight away. Toss asks Razorpay about each payment; the webhook (optional) makes it instant
  await db.from("tenants").update({ online_gateway: "razorpay" }).eq("id", session.tenantId);
  done();
  return { message: `Razorpay is connected${live ? "" : " in test mode (no real money)"}. Customers now pay online and payments confirm themselves.` };
}

export async function disconnectGateway(fd: FormData) {
  const session = await requireManager();
  const db = supabaseAdmin();
  const { data: row } = await db.from("tenant_gateways").select("*").eq("tenant_id", session.tenantId).maybeSingle();
  if (row?.provider === "stripe" && row.webhook_endpoint_id) {
    await deleteStripeWebhook({ provider: "stripe", secret: open(row.secret_enc as string) }, row.webhook_endpoint_id as string);
  }
  await db.from("tenant_gateways").delete().eq("tenant_id", session.tenantId);
  await db.from("tenants").update({ online_gateway: null }).eq("id", session.tenantId);
  void fd;
  done();
}

// ---------- paying ----------
/** Customer: open the gateway's page for one bill (plus an optional tip). Returns where to send the browser. */
export async function payBillOnline(orderId: string, tip: number): Promise<{ url?: string; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "CUSTOMER") return { error: "Please sign in again." };
  const safeTip = Number.isFinite(tip) && tip > 0 && tip <= 100_000 ? Math.round(tip * 100) / 100 : 0;
  return startOrderPayment(orderId, session.userId, safeTip);
}

/** Manager: pay the Toss subscription through Toss's gateway. The amount is worked out here, as on Billing. */
export async function paySubscriptionOnline(months: number): Promise<{ url?: string; error?: string }> {
  const session = await requireManager();
  if (![1, 3, 6, 12].includes(months)) return { error: "Choose 1, 3, 6 or 12 months." };
  const [tenant, platform] = await Promise.all([getTenantById(session.tenantId), getPlatformSettings()]);
  if (!tenant) return { error: "Business not found." };
  const currency = subscriptionCurrency(tenant);
  const usd = currency === "USD";
  const monthly = usd ? (tenant.parentTenantId ? platform.usdBranchPrice : platform.usdMonthlyPrice) : tenant.parentTenantId ? platform.branchPrice : platform.monthlyPrice;
  const { amount: before, pct } = subscriptionQuote(monthly, platform, months, currency);
  const { credit, toPay } = usd ? { credit: 0, toPay: before } : withBasketCredit(before, await getTenantCreditBalance(tenant.id), platform.creditSubMaxPct);
  // the payer's mobile number, so the gateway doesn't ask for it (Indian gateways must collect one)
  const { data: me } = await supabaseAdmin().from("customers").select("phone").eq("id", session.userId).maybeSingle();
  return startSubscriptionPayment(tenant.id, { months, amount: toPay, currency, discountPct: pct, creditUsed: credit, business: tenant.name, email: session.email, phone: (me?.phone as string) ?? undefined });
}

/** The page the customer or manager returns to asks this (Toss checks with the gateway if needed). */
export async function paymentStatus(intentId: string): Promise<{ status: string } | null> {
  const session = await getSession();
  if (!session) return null;
  const r = await refreshIntent(intentId, { customerId: session.role === "CUSTOMER" ? session.userId : undefined, tenantId: session.role === "MANAGER" ? session.tenantId : undefined });
  return r ? { status: r.status } : null;
}

// ---------- Toss's own gateway (owner) ----------
async function requireOwner() {
  const session = await getSession();
  if (!session || session.role !== "OWNER") throw new Error("Not the owner");
  return session;
}

/**
 * The owner connects Toss's own Razorpay or Stripe for subscriptions: one for rupees (Indian businesses), one for
 * US dollars. Same steps as a laundry's: Razorpay needs the webhook secret as a second step, Stripe sets itself up.
 */
export async function connectPlatformGateway(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireOwner();
  const wrong = await checkPassword(session, String(fd.get("password") ?? ""));
  if (wrong) return { error: wrong };
  const group = text(fd, "group") === "USD" ? "USD" : "INR";
  const provider = text(fd, "provider") as Provider;
  if (provider !== "razorpay" && provider !== "stripe") return { error: "Choose Razorpay or Stripe." };
  const db = supabaseAdmin();
  const { data: existing, error: tableErr } = await db.from("platform_gateways").select("*").eq("currency_group", group).maybeSingle();
  if (tableErr) return { error: "Run the 0036 database update first (Supabase → SQL Editor)." };

  const webhookSecret = text(fd, "webhookSecret");
  if (provider === "razorpay" && existing?.provider === "razorpay" && !text(fd, "secret") && webhookSecret) {
    if (webhookSecret.length < 8) return { error: "Paste the webhook secret you typed in Razorpay." };
    await db.from("platform_gateways").update({ webhook_secret_enc: seal(webhookSecret) }).eq("currency_group", group);
    revalidatePath("/owner", "layout");
    revalidatePath("/admin", "layout");
    return { message: "Webhook added. Plan payments now confirm the moment they're made." };
  }

  const keys: GatewayKeys = { provider, keyId: text(fd, "keyId") || undefined, secret: text(fd, "secret") };
  if (!keys.secret) return { error: provider === "razorpay" ? "Paste your Razorpay key secret." : "Paste your Stripe secret key." };
  let live: boolean;
  try {
    ({ live } = await testKeys(keys));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Those keys didn't work." };
  }
  if (existing?.provider === "stripe" && existing.webhook_endpoint_id) {
    await deleteStripeWebhook({ provider: "stripe", secret: open(existing.secret_enc as string) }, existing.webhook_endpoint_id as string);
  }
  const { error } = await db
    .from("platform_gateways")
    .upsert(
      { currency_group: group, provider, key_id: keys.keyId ?? null, secret_enc: seal(keys.secret), webhook_secret_enc: null, webhook_endpoint_id: null, live, connected_at: new Date().toISOString() },
      { onConflict: "currency_group" },
    );
  if (error) return { error: "Couldn't save the connection. Try again." };
  if (provider === "stripe") {
    try {
      const hook = await createStripeWebhook(keys, webhookUrl("stripe", platformToken(group)));
      await db.from("platform_gateways").update({ webhook_secret_enc: seal(hook.secret), webhook_endpoint_id: hook.id }).eq("currency_group", group);
    } catch (err) {
      return { error: `Stripe accepted the key but Toss couldn't add its webhook: ${err instanceof Error ? err.message : "unknown error"}.` };
    }
    revalidatePath("/owner", "layout");
    revalidatePath("/admin", "layout");
    return { message: `Stripe is connected for ${group === "INR" ? "rupee" : "US dollar"} subscriptions${live ? "" : " (test mode)"}.` };
  }
  revalidatePath("/owner", "layout");
  revalidatePath("/admin", "layout");
  return { message: `Razorpay is connected for ${group === "INR" ? "rupee" : "US dollar"} plans${live ? "" : " (test mode)"}. Businesses now pay with one tap and plans extend by themselves.` };
}

export async function disconnectPlatformGateway(fd: FormData) {
  await requireOwner();
  const group = text(fd, "group") === "USD" ? "USD" : "INR";
  const db = supabaseAdmin();
  const { data: row } = await db.from("platform_gateways").select("*").eq("currency_group", group).maybeSingle();
  if (row?.provider === "stripe" && row.webhook_endpoint_id) {
    await deleteStripeWebhook({ provider: "stripe", secret: open(row.secret_enc as string) }, row.webhook_endpoint_id as string);
  }
  await db.from("platform_gateways").delete().eq("currency_group", group);
  revalidatePath("/owner", "layout");
  revalidatePath("/admin", "layout");
}

// ---------- pay automatically (customer, Stripe) ----------
async function requireCustomerTenant() {
  const session = await getSession();
  if (!session || session.role !== "CUSTOMER") throw new Error("Please sign in again.");
  const { data } = await supabaseAdmin().from("customers").select("tenant_id").eq("id", session.userId).maybeSingle();
  if (!data?.tenant_id) throw new Error("Join a laundry first.");
  return { customerId: session.userId, tenantId: data.tenant_id as string };
}

/** Customer: open Stripe's page to save a card / Apple Pay / Google Pay, with the tip to add to every bill. */
export async function startAutopay(tipPct: number): Promise<{ url?: string; error?: string }> {
  const me = await requireCustomerTenant();
  return startCardSetup(me.tenantId, me.customerId, Number.isFinite(tipPct) ? tipPct : 0);
}

export async function updateAutopay(fd: FormData) {
  const me = await requireCustomerTenant();
  const on = text(fd, "on") !== "0";
  const tip = text(fd, "tip");
  await setAutopay(me.tenantId, me.customerId, on, tip ? Number(tip) : undefined);
  revalidatePath("/app", "layout");
}

// ---------- the laundry: also take UPI / direct payments next to its gateway ----------
export async function setAlsoDirect(fd: FormData) {
  const session = await requireManager();
  await supabaseAdmin().from("tenants").update({ also_direct: text(fd, "on") === "1" }).eq("id", session.tenantId);
  done();
}
