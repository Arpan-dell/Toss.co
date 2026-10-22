import "server-only";
import {
  cancelRenewal,
  cardFromSetup,
  chargeRazorpayToken,
  chargeSavedCard,
  createCardSetup,
  createCheckout,
  createRazorpayMandate,
  createRenewal,
  createStripeCustomer,
  checkoutStatus,
  fromMinor,
  gatewayLabel,
  parseDodo,
  parseRazorpay,
  parseStripe,
  razorpayMandateResult,
  renewalStatus,
  RZP_MANDATE_MAX_MINOR,
  toMinor,
  verifyDodo,
  verifyRazorpay,
  verifyStripe,
  type GatewayEvent,
  type GatewayKeys,
  type Provider,
} from "./gateways";
import { notifySubscriptionReviewed } from "./email/notify";
import { sendInvoice } from "./invoice/service";
import { logError } from "./log";
import { open } from "./secret-box";
import { roundMoney } from "./regions";
import { APP_URL } from "./site";
import { supabaseAdmin } from "./supabase/admin";

// Payments confirmed by the gateway (migration 0036). The flow, for a laundry bill:
//  1. startOrderPayment: the customer taps Pay. Toss reads the amount from the database, records a payment intent
//     and asks the laundry's gateway for a payment page for exactly that amount.
//  2. The customer pays on the gateway's page (UPI, card, netbanking…).
//  3. The gateway calls /api/pay/webhook/<provider>/<token> with a signed message. handleWebhook checks the
//     signature with the laundry's webhook secret, checks the amount and currency, and marks the bill paid.
//  4. The page the customer returns to only asks Toss for the status (refreshIntent), and Toss asks the gateway
//     directly if the webhook hasn't arrived yet. Nothing in that URL can mark anything paid.
// Subscriptions to Toss work the same way with Toss's own gateway keys (environment variables).

const db = () => supabaseAdmin();
type Intent = {
  id: string;
  kind: "order" | "subscription";
  tenant_id: string;
  order_id: string | null;
  customer_id: string | null;
  months: number | null;
  discount_pct: number;
  credit_used: number;
  provider: Provider;
  platform: boolean;
  provider_ref: string | null;
  checkout_url: string | null;
  amount_minor: number;
  currency: string;
  tip: number;
  status: string;
  created_at: string;
};

// ---------- whose gateway ----------
/** The laundry's own gateway, decrypted, or null if it hasn't connected one (or hasn't finished connecting). */
export async function tenantGateway(tenantId: string): Promise<(GatewayKeys & { token: string; live: boolean }) | null> {
  const { data, error } = await db().from("tenant_gateways").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (error || !data) return null;
  return {
    provider: data.provider as Provider,
    keyId: (data.key_id as string) ?? undefined,
    secret: open(data.secret_enc as string),
    webhookSecret: data.webhook_secret_enc ? open(data.webhook_secret_enc as string) : undefined,
    token: data.webhook_token as string,
    live: data.live === true,
  };
}

/** Rupee subscriptions (Indian businesses) or US dollar ones (everyone else). */
export const groupOf = (currency: string): "INR" | "USD" => (currency.toUpperCase() === "INR" ? "INR" : "USD");
/** The webhook token for Toss's own gateway: one per currency group. */
export const platformToken = (group: "INR" | "USD") => `platform${group.toLowerCase()}`;

/**
 * Toss's own gateway for subscriptions: what the owner connected in Owner → Plan & payments, or failing that the
 * environment variables (Razorpay for rupees, Stripe for US dollars).
 */
export async function platformGateway(currency: string): Promise<(GatewayKeys & { live?: boolean }) | null> {
  const group = groupOf(currency);
  const { data } = await db().from("platform_gateways").select("*").eq("currency_group", group).maybeSingle();
  if (data) {
    return {
      provider: data.provider as Provider,
      keyId: (data.key_id as string) ?? undefined,
      secret: open(data.secret_enc as string),
      webhookSecret: data.webhook_secret_enc ? open(data.webhook_secret_enc as string) : undefined,
      live: data.live === true,
      products: (data.config as { once?: string; monthly?: string } | null) ?? undefined,
    };
  }
  return envPlatformGateway(group);
}

function envPlatformGateway(group: "INR" | "USD"): GatewayKeys | null {
  if (group === "INR" && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    return { provider: "razorpay", keyId: process.env.RAZORPAY_KEY_ID, secret: process.env.RAZORPAY_KEY_SECRET, webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || undefined };
  }
  if (group === "USD" && process.env.STRIPE_SECRET_KEY) {
    return { provider: "stripe", secret: process.env.STRIPE_SECRET_KEY, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || undefined };
  }
  return null;
}

/** Which gateway Toss takes subscriptions through for this currency (no keys leave this file). */
export async function platformGatewayName(currency: string): Promise<string | null> {
  const g = await platformGateway(currency).catch(() => null);
  return g ? gatewayLabel(g.provider) : null;
}

export const webhookUrl = (provider: Provider, token: string) => `${APP_URL}/api/pay/webhook/${provider}/${token}`;

// ---------- 1. starting a payment ----------
/**
 * A payment page for one of the customer's unpaid bills (plus an optional tip). Reuses an open page for the same
 * amount, so tapping Pay twice doesn't create two ways to pay the same bill.
 */
export async function startOrderPayment(orderId: string, customerId: string, tip = 0): Promise<{ url: string } | { error: string }> {
  const { data: o } = await db().from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!o || o.customer_id !== customerId) return { error: "Order not found." };
  if (o.payment_status !== "UNPAID" || o.status !== "COMPLETED" || o.account_id) return { error: "This bill isn't open for payment." };
  const { data: t } = await db().from("tenants").select("*").eq("id", o.tenant_id as string).maybeSingle();
  if (!t) return { error: "Laundry not found." };
  const gw = await tenantGateway(t.id as string);
  if (!gw) return { error: "This laundry doesn't take online payments yet." };

  const currency = ((t.currency as string) ?? "INR").toUpperCase();
  const amount = Number(o.amount_due) + Math.max(0, tip);
  const minor = toMinor(amount, currency);
  if (!(minor > 0)) return { error: "Nothing to pay." };

  const existing = await reuse({ order_id: orderId, amount_minor: minor, provider: gw.provider });
  if (existing) return { url: existing };

  const { data: customer } = await db().from("customers").select("name, email, phone").eq("id", customerId).maybeSingle();
  return begin(
    { kind: "order", tenant_id: t.id as string, order_id: orderId, customer_id: customerId, provider: gw.provider, platform: false, amount_minor: minor, currency, tip: Math.max(0, tip) },
    gw,
    (id) => ({
      amount,
      currency,
      description: `Laundry pickup #${o.device_order_id} · ${t.name as string}`,
      reference: id,
      returnUrl: `${APP_URL}/app/pay/${id}`,
      cancelUrl: `${APP_URL}/app?pay=cancelled`,
      customer: { name: (customer?.name as string) ?? undefined, email: (customer?.email as string) ?? undefined, phone: (customer?.phone as string) ?? undefined },
    }),
  );
}

/** A payment page for the Toss subscription, through Toss's own gateway. Amount, discount and credit are worked out by the caller (Billing). */
export async function startSubscriptionPayment(
  tenantId: string,
  p: { months: number; amount: number; currency: string; discountPct: number; creditUsed: number; business: string; email?: string; phone?: string },
): Promise<{ url: string } | { error: string }> {
  const gw = await platformGateway(p.currency);
  if (!gw) return { error: "Online subscription payments aren't set up yet." };
  const minor = toMinor(p.amount, p.currency);
  if (!(minor > 0)) return { error: "Nothing to pay." };
  return begin(
    { kind: "subscription", tenant_id: tenantId, months: p.months, discount_pct: p.discountPct, credit_used: p.creditUsed, provider: gw.provider, platform: true, amount_minor: minor, currency: p.currency, tip: 0 },
    gw,
    (id) => ({
      amount: p.amount,
      currency: p.currency,
      description: `Toss Pro · ${p.months} month${p.months > 1 ? "s" : ""} · ${p.business}`,
      reference: id,
      returnUrl: `${APP_URL}/admin/billing?intent=${id}`,
      cancelUrl: `${APP_URL}/admin/billing`,
      customer: { name: p.business, email: p.email, phone: p.phone },
    }),
  );
}

async function reuse(match: { order_id: string; amount_minor: number; provider: Provider }): Promise<string | null> {
  const since = new Date(Date.now() - 12 * 3_600_000).toISOString();
  const { data } = await db()
    .from("payment_intents")
    .select("checkout_url")
    .eq("order_id", match.order_id)
    .eq("amount_minor", match.amount_minor)
    .eq("provider", match.provider)
    .eq("status", "created")
    .gte("created_at", since)
    .not("checkout_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.checkout_url as string) ?? null;
}

async function begin(row: Record<string, unknown>, gw: GatewayKeys, request: (id: string) => Parameters<typeof createCheckout>[1]): Promise<{ url: string } | { error: string }> {
  const { data: intent, error } = await db().from("payment_intents").insert(row).select("id").single();
  if (error || !intent) return { error: "Couldn't start the payment. Try again." };
  try {
    const page = await createCheckout(gw, request(intent.id as string));
    await db().from("payment_intents").update({ provider_ref: page.ref, checkout_url: page.url }).eq("id", intent.id);
    return { url: page.url };
  } catch (err) {
    await db().from("payment_intents").update({ status: "failed" }).eq("id", intent.id);
    const msg = err instanceof Error ? err.message : String(err);
    logError("gateway checkout failed", msg);
    // revoked or wrong keys: retrying won't help, whoever set up the gateway has to update them
    if (/authentication|unauthori[sz]ed|invalid api key|api key provided/i.test(msg)) {
      return { error: row.platform ? "Toss's payment setup needs updating (the gateway rejected its keys). Please try again later." : "This laundry's payment setup needs updating. Please pay another way for now." };
    }
    return { error: "The payment page couldn't be opened. Try again in a minute." };
  }
}

// ---------- 2–3. the gateway tells us ----------
/** Handles one webhook. Returns the HTTP status to answer with (the gateway retries anything but 2xx). */
export async function handleWebhook(provider: Provider, token: string, raw: string, headers: Headers): Promise<number> {
  // Toss's own gateway: "platforminr" / "platformusd" (connected in the owner dashboard), or "platform" (env keys)
  const platform = token === "platform" || token === platformToken("INR") || token === platformToken("USD");
  let keys: GatewayKeys | null;
  if (platform) {
    const group = token === platformToken("INR") ? "INR" : token === platformToken("USD") ? "USD" : provider === "razorpay" ? "INR" : "USD";
    keys = token === "platform" ? envPlatformGateway(group) : await platformGateway(group);
    if (token !== "platform") await db().from("platform_gateways").update({ last_event_at: new Date().toISOString() }).eq("currency_group", group);
  } else {
    const { data: row } = await db().from("tenant_gateways").select("tenant_id, provider, webhook_secret_enc").eq("webhook_token", token).maybeSingle();
    keys = row && row.provider === provider && row.webhook_secret_enc ? { provider, secret: "", webhookSecret: open(row.webhook_secret_enc as string) } : null;
    if (row) await db().from("tenant_gateways").update({ last_event_at: new Date().toISOString() }).eq("tenant_id", row.tenant_id);
  }
  if (!keys?.webhookSecret || keys.provider !== provider || (provider === "dodo" && !platform)) return 404;

  const ok =
    provider === "razorpay"
      ? verifyRazorpay(raw, headers.get("x-razorpay-signature"), keys.webhookSecret)
      : provider === "dodo"
        ? verifyDodo(raw, { id: headers.get("webhook-id"), timestamp: headers.get("webhook-timestamp"), signature: headers.get("webhook-signature") }, keys.webhookSecret)
        : verifyStripe(raw, headers.get("stripe-signature"), keys.webhookSecret);
  if (!ok) return 400; // not from the gateway (or tampered with): ignored

  let event: GatewayEvent;
  try {
    event = provider === "razorpay" ? parseRazorpay(raw, headers.get("x-razorpay-event-id")) : provider === "dodo" ? parseDodo(raw, headers.get("webhook-id")) : parseStripe(raw);
  } catch {
    return 400;
  }
  // each event once: gateways may deliver the same one several times
  const { error: dup } = await db().from("payment_events").insert({ provider, event_id: event.eventId, type: event.type });
  if (dup) return 200;
  if (event.setup && event.ref) {
    await finishCardSetup(event.ref).catch((err) => logError("card setup finish failed", err instanceof Error ? err.message : err));
    return 200;
  }
  if (event.renewal) {
    if (platform) await onRenewal(provider, event).catch((err) => logError("plan renewal event failed", err instanceof Error ? err.message : err));
    return 200;
  }
  if (event.status === "ignore" || !event.ref) return 200;

  const { data: intent } = await db().from("payment_intents").select("*").eq("provider_ref", event.ref).eq("provider", provider).maybeSingle();
  if (!intent || (intent as Intent).platform !== platform) return 200; // not one of ours (another app on the same account)
  await db().from("payment_events").update({ intent_id: intent.id }).eq("provider", provider).eq("event_id", event.eventId);
  await settle(intent as Intent, event);
  return 200;
}

/** Applies a confirmed result to the intent and its bill or subscription. Safe to call more than once. */
export async function settle(intent: Intent, event: GatewayEvent): Promise<string> {
  if (event.status === "failed" || event.status === "expired") {
    await db().from("payment_intents").update({ status: event.status }).eq("id", intent.id).eq("status", "created");
    return event.status;
  }
  if (event.status !== "paid") return intent.status;
  // the gateway must report exactly what Toss asked for
  if (event.amountMinor !== intent.amount_minor || (event.currency ?? "").toUpperCase() !== intent.currency.toUpperCase()) {
    await db().from("payment_intents").update({ status: "mismatch", provider_payment_id: event.paymentId ?? null }).eq("id", intent.id).eq("status", "created");
    logError("gateway amount mismatch", { intent: intent.id, expected: intent.amount_minor, got: event.amountMinor, currency: event.currency });
    return "mismatch";
  }
  // only the first confirmation goes on (webhook and status check can both arrive)
  const { data: won } = await db()
    .from("payment_intents")
    .update({ status: "paid", provider_payment_id: event.paymentId ?? null, method: event.method ?? null, paid_at: new Date().toISOString() })
    .eq("id", intent.id)
    .eq("status", "created")
    .select("id");
  if (!won?.length) return "paid";

  try {
    if (intent.kind === "order" && intent.order_id) await payOrder(intent, event);
    if (intent.kind === "subscription") await paySubscription(intent, event);
  } catch (err) {
    logError("gateway settle failed", { intent: intent.id, err: err instanceof Error ? err.message : err });
  }
  return "paid";
}

async function payOrder(intent: Intent, event: GatewayEvent) {
  const { data: o } = await db().from("orders").select("amount_due, payment_status").eq("id", intent.order_id!).maybeSingle();
  if (!o) return;
  if (o.payment_status === "PAID") {
    // paid twice (two tabs, or paid in cash meanwhile): the laundry refunds it from its gateway dashboard
    logError("order already paid; gateway payment needs a refund", { intent: intent.id, order: intent.order_id, payment: event.paymentId });
    return;
  }
  const paid = fromMinor(intent.amount_minor, intent.currency) - intent.tip;
  // the bill went up after the page was made (re-weighed): the laundry checks it rather than it closing short
  const short = paid + 0.005 < Number(o.amount_due);
  const now = new Date().toISOString();
  await db()
    .from("orders")
    .update({
      payment_status: short ? "PENDING" : "PAID",
      payment_method: intent.provider === "razorpay" ? "RAZORPAY" : "STRIPE",
      payment_ref: event.paymentId ?? null,
      payment_reported_at: now,
      payment_confirmed_at: short ? null : now,
      tip: intent.tip,
    })
    .eq("id", intent.order_id!)
    .neq("payment_status", "PAID");
  if (!short) await sendInvoice(intent.order_id!);
}

async function paySubscription(intent: Intent, event: GatewayEvent) {
  const { data: row, error } = await db()
    .from("subscription_payments")
    .insert({
      tenant_id: intent.tenant_id,
      months: intent.months,
      amount: fromMinor(intent.amount_minor, intent.currency),
      discount_pct: intent.discount_pct,
      credit_used: intent.credit_used,
      payment_ref: (event.paymentId ?? intent.id).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 35),
      currency: intent.currency,
    })
    .select("id")
    .single();
  if (error || !row) throw error ?? new Error("subscription payment not recorded");
  // confirmed by the gateway: extend the plan straight away, as an owner approval would
  const { error: e2 } = await db().rpc("review_subscription_payment", { p_id: row.id, p_approve: true });
  if (e2) throw e2;
  await notifySubscriptionReviewed(row.id as number);
}

// ---------- 4. the customer is back: ask, don't trust ----------
/**
 * The status of a payment, for the page the customer returns to. If the webhook hasn't arrived, Toss asks the
 * gateway directly (server to server). `owner` limits it to the person who started it.
 */
export async function refreshIntent(id: string, owner: { customerId?: string; tenantId?: string }): Promise<{ status: string; kind: string; orderId?: string } | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await db().from("payment_intents").select("*").eq("id", id).maybeSingle();
  const intent = data as Intent | null;
  if (!intent) return null;
  if (intent.kind === "order" ? intent.customer_id !== owner.customerId : intent.tenant_id !== owner.tenantId) return null;
  let status = intent.status;
  if (status === "created" && intent.provider_ref) status = await check(intent);
  return { status, kind: intent.kind, orderId: intent.order_id ?? undefined };
}

async function check(intent: Intent): Promise<string> {
  const keys = intent.platform ? await platformGateway(intent.currency) : await tenantGateway(intent.tenant_id);
  if (!keys || !intent.provider_ref) return intent.status;
  try {
    return await settle(intent, await checkoutStatus(keys, intent.provider_ref));
  } catch (err) {
    logError("gateway status check failed", err instanceof Error ? err.message : err);
    return intent.status;
  }
}

/**
 * Payments still open for one laundry (or one customer): asked straight from the gateway. Pages call this after
 * they've been sent (next/server's after()), so a payment confirms within moments even without a webhook, e.g.
 * when the customer paid and closed the tab before coming back.
 */
export async function reconcileFor(who: { tenantId?: string; customerId?: string }, limit = 10): Promise<number> {
  if (!who.tenantId && !who.customerId) return 0;
  let q = db()
    .from("payment_intents")
    .select("*")
    .eq("status", "created")
    .not("provider_ref", "is", null)
    .lt("created_at", new Date(Date.now() - 20_000).toISOString())
    .gt("created_at", new Date(Date.now() - 3 * 86_400_000).toISOString())
    .limit(limit);
  q = who.customerId ? q.eq("customer_id", who.customerId) : q.eq("tenant_id", who.tenantId!);
  const { data, error } = await q;
  if (error) return 0; // before migration 0036
  let paid = 0;
  for (const intent of (data ?? []) as Intent[]) if ((await check(intent)) === "paid") paid++;
  return paid;
}

/** Daily: payments still open from the last 3 days, in case a webhook was lost. */
export async function reconcileOpenIntents(limit = 50): Promise<{ checked: number; paid: number }> {
  const { data } = await db()
    .from("payment_intents")
    .select("*")
    .eq("status", "created")
    .not("provider_ref", "is", null)
    .lt("created_at", new Date(Date.now() - 5 * 60_000).toISOString())
    .gt("created_at", new Date(Date.now() - 3 * 86_400_000).toISOString())
    .limit(limit);
  let paid = 0;
  for (const intent of (data ?? []) as Intent[]) if ((await check(intent)) === "paid") paid++;
  return { checked: data?.length ?? 0, paid };
}

// ================= pay automatically (saved card, Stripe) =================
export type Autopay = { brand?: string; last4?: string; exp?: string; tipPct: number; on: boolean };

/** A customer's saved card at their laundry, for the dashboard (no secrets). Null when none, or before 0037. */
export async function getAutopay(tenantId: string, customerId: string): Promise<Autopay | null> {
  const { data, error } = await db().from("customer_payment_profiles").select("*").eq("tenant_id", tenantId).eq("customer_id", customerId).maybeSingle();
  if (error || !data?.payment_method_id) return null;
  return { brand: (data.brand as string) ?? undefined, last4: (data.last4 as string) ?? undefined, exp: (data.exp as string) ?? undefined, tipPct: Number(data.tip_pct) || 0, on: data.autopay === true };
}

/** Opens Stripe's page to save a card (or Apple Pay / Google Pay) for automatic payments. */
export async function startCardSetup(tenantId: string, customerId: string, tipPct: number): Promise<{ url: string } | { error: string }> {
  const gw = await tenantGateway(tenantId);
  const { data: t } = await db().from("tenants").select("currency, name").eq("id", tenantId).maybeSingle();
  if (!gw || (gw.provider === "razorpay" && t?.currency !== "INR")) return { error: "Your laundry doesn't take automatic payments." };
  const { data: c } = await db().from("customers").select("name, email, phone, tenant_id").eq("id", customerId).maybeSingle();
  if (!c || c.tenant_id !== tenantId) return { error: "Customer not found." };
  const { data: existing, error } = await db().from("customer_payment_profiles").select("provider_customer_id, provider").eq("tenant_id", tenantId).eq("customer_id", customerId).maybeSingle();
  if (error) return { error: "Automatic payments switch on after the next database update." };
  const tip = Math.max(0, Math.min(30, Math.round(tipPct)));
  if (gw.provider === "razorpay") {
    try {
      const page = await createRazorpayMandate(gw, {
        who: { name: (c.name as string) ?? undefined, email: (c.email as string) ?? undefined, phone: (c.phone as string) ?? undefined },
        description: `Automatic laundry payments · ${(t?.name as string) ?? "Toss"}`,
        reference: `${tenantId}-${customerId}`.slice(0, 40),
        returnUrl: `${APP_URL}/app/autopay`,
      });
      await db()
        .from("customer_payment_profiles")
        .upsert(
          { tenant_id: tenantId, customer_id: customerId, provider: "razorpay", provider_customer_id: existing?.provider === "razorpay" ? existing.provider_customer_id : "pending", setup_ref: page.ref, tip_pct: tip, updated_at: new Date().toISOString() },
          { onConflict: "tenant_id,customer_id" },
        );
      return { url: page.url };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logError("razorpay mandate failed", msg);
      return { error: /recurring|not enabled|not allowed|feature/i.test(msg) ? "Your laundry hasn't switched on automatic card payments with Razorpay yet." : "Couldn't open the card page. Try again in a minute." };
    }
  }
  try {
    const stripeCustomer =
      (existing?.provider_customer_id as string) ?? (await createStripeCustomer(gw, { email: (c.email as string) ?? undefined, name: (c.name as string) ?? undefined, tossCustomer: customerId }));
    const page = await createCardSetup(gw, {
      customer: stripeCustomer,
      currency: ((t?.currency as string) ?? "USD").toLowerCase(),
      returnUrl: `${APP_URL}/app/autopay?session={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${APP_URL}/app`,
    });
    await db()
      .from("customer_payment_profiles")
      .upsert(
        { tenant_id: tenantId, customer_id: customerId, provider: "stripe", provider_customer_id: stripeCustomer, setup_ref: page.ref, tip_pct: tip, updated_at: new Date().toISOString() },
        { onConflict: "tenant_id,customer_id" },
      );
    return { url: page.url };
  } catch (err) {
    logError("card setup failed", err instanceof Error ? err.message : err);
    return { error: "Couldn't open the card page. Try again in a minute." };
  }
}

/** The customer finished Stripe's card page (their return, or Stripe's webhook): save the card, switch on. */
export async function finishCardSetup(sessionId: string, customerId?: string): Promise<boolean> {
  let q = db().from("customer_payment_profiles").select("*").eq("setup_ref", sessionId);
  if (customerId) q = q.eq("customer_id", customerId);
  const { data: p } = await q.maybeSingle();
  if (!p) return false;
  const gw = await tenantGateway(p.tenant_id as string);
  if (!gw || gw.provider !== (p.provider ?? "stripe")) return false;
  let saved: { paymentMethod: string; customer?: string; brand?: string; last4?: string; exp?: string } | null;
  if (gw.provider === "razorpay") {
    const r = await razorpayMandateResult(gw, sessionId);
    saved = r && { paymentMethod: r.token, customer: r.customer, brand: r.brand, last4: r.last4, exp: r.exp };
  } else {
    saved = await cardFromSetup(gw, sessionId);
  }
  if (!saved) return false;
  const card = saved;
  await db()
    .from("customer_payment_profiles")
    .update({
      payment_method_id: card.paymentMethod,
      ...(card.customer ? { provider_customer_id: card.customer } : {}),
      brand: card.brand ?? null,
      last4: card.last4 ?? null,
      exp: card.exp ?? null,
      autopay: true,
      setup_ref: null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", p.tenant_id)
    .eq("customer_id", p.customer_id);
  return true;
}

export async function setAutopay(tenantId: string, customerId: string, on: boolean, tipPct?: number) {
  const patch: Record<string, unknown> = { autopay: on, updated_at: new Date().toISOString() };
  if (tipPct !== undefined) patch.tip_pct = Math.max(0, Math.min(30, Math.round(tipPct)));
  await db().from("customer_payment_profiles").update(patch).eq("tenant_id", tenantId).eq("customer_id", customerId);
}

/**
 * Charges a ready bill to the customer's saved card, if they switched on automatic payments. Called when the
 * laundry marks an order ready (and daily for any missed). The charge is confirmed like any other gateway payment;
 * a declined card leaves the bill open for the customer to pay by hand.
 */
export async function autoChargeOrder(orderId: string): Promise<"paid" | "skipped" | "failed"> {
  const { data: o } = await db().from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!o || o.status !== "COMPLETED" || o.payment_status !== "UNPAID" || o.account_id || !o.customer_id || !(Number(o.amount_due) > 0) || o.weigh_pending) return "skipped";
  const { data: p, error } = await db().from("customer_payment_profiles").select("*").eq("tenant_id", o.tenant_id).eq("customer_id", o.customer_id).maybeSingle();
  if (error || !p?.autopay || !p.payment_method_id) return "skipped";
  const gw = await tenantGateway(o.tenant_id as string);
  if (!gw || gw.provider !== (p.provider ?? "stripe")) return "skipped";
  // one automatic try per bill
  const { data: tried } = await db().from("payment_intents").select("id").eq("order_id", orderId).eq("auto", true).limit(1);
  if (tried?.length) return "skipped";
  const { data: t } = await db().from("tenants").select("currency, name").eq("id", o.tenant_id).maybeSingle();
  const currency = ((t?.currency as string) ?? "USD").toUpperCase();
  const tip = roundMoney((Number(o.amount_due) * (Number(p.tip_pct) || 0)) / 100, currency);
  const amount = Number(o.amount_due) + tip;
  const minor = toMinor(amount, currency);
  // over the card mandate's limit: the customer pays this one by hand
  if (gw.provider === "razorpay" && (currency !== "INR" || minor > RZP_MANDATE_MAX_MINOR)) return "skipped";
  const { data: intent } = await db()
    .from("payment_intents")
    .insert({ kind: "order", tenant_id: o.tenant_id, order_id: orderId, customer_id: o.customer_id, provider: gw.provider, platform: false, amount_minor: minor, currency, tip, auto: true })
    .select("*")
    .single();
  if (!intent) return "failed";
  if (gw.provider === "razorpay") {
    // Razorpay sends the bank's pre-debit notice and takes the money about a day later; the webhook settles it
    const { data: c } = await db().from("customers").select("name, email, phone").eq("id", o.customer_id).maybeSingle();
    const r = await chargeRazorpayToken(gw, {
      amountMinor: minor,
      customer: p.provider_customer_id as string,
      token: p.payment_method_id as string,
      description: `Laundry pickup #${o.device_order_id} · ${(t?.name as string) ?? "Toss"}`,
      reference: intent.id as string,
      who: { name: (c?.name as string) ?? undefined, email: (c?.email as string) ?? undefined, phone: (c?.phone as string) ?? undefined },
    });
    if (r.ref) {
      await db().from("payment_intents").update({ provider_ref: r.ref }).eq("id", intent.id);
      return "skipped";
    }
    await db().from("payment_intents").update({ status: "failed" }).eq("id", intent.id).eq("status", "created");
    logError("automatic charge failed", { order: orderId, error: r.error });
    return "failed";
  }
  const r = await chargeSavedCard(gw, {
    amountMinor: minor,
    currency,
    customer: p.provider_customer_id as string,
    paymentMethod: p.payment_method_id as string,
    description: `Laundry pickup #${o.device_order_id} · ${(t?.name as string) ?? "Toss"}`,
    reference: intent.id as string,
  });
  if (r.id) await db().from("payment_intents").update({ provider_ref: r.id }).eq("id", intent.id);
  if (r.status === "succeeded") {
    await settle(
      { ...(intent as Intent), provider_ref: r.id ?? null },
      { eventId: `auto:${r.id}`, type: "auto.charge", ref: r.id, status: "paid", paymentId: r.id, amountMinor: r.amountMinor ?? minor, currency, method: "card" },
    );
    return "paid";
  }
  if (r.status === "processing") return "skipped"; // a bank debit clearing: the webhook / daily check settles it
  await db().from("payment_intents").update({ status: "failed" }).eq("id", intent.id).eq("status", "created");
  logError("automatic charge declined", { order: orderId, status: r.status, error: r.error });
  return "failed";
}

/** Daily: ready, unpaid bills of customers with automatic payments on (in case marking ready didn't charge). */
export async function autoChargeDue(limit = 30): Promise<number> {
  const { data: profiles, error } = await db().from("customer_payment_profiles").select("tenant_id, customer_id").eq("autopay", true).not("payment_method_id", "is", null).limit(500);
  if (error || !profiles?.length) return 0;
  let paid = 0;
  for (const p of profiles) {
    const { data: due } = await db()
      .from("orders")
      .select("id")
      .eq("tenant_id", p.tenant_id)
      .eq("customer_id", p.customer_id)
      .eq("status", "COMPLETED")
      .eq("payment_status", "UNPAID")
      .not("ready_at", "is", null)
      .is("account_id", null)
      .limit(5);
    for (const o of due ?? []) {
      if ((await autoChargeOrder(o.id as string)) === "paid") paid++;
      if (--limit <= 0) return paid;
    }
  }
  return paid;
}

// ================= automatic plan renewal (laundries paying Toss) =================
// The manager approves a monthly subscription once on Toss's gateway (Razorpay: card or UPI Autopay; Stripe:
// card, Apple Pay, Google Pay). Each month the gateway charges it and tells Toss by webhook; Toss checks the amount
// and extends the plan by a month, exactly like a payment made by hand.

export type Renewal = { status: "created" | "active" | "failing" | "cancelled"; provider: Provider; amount: number; currency: string; lastChargedAt?: string };

const renewalRow = async (tenantId: string) => (await db().from("plan_autorenew").select("*").eq("tenant_id", tenantId).maybeSingle()).data as Record<string, unknown> | null;

/** The laundry's automatic renewal, for Billing. Asks the gateway if a just-opened one hasn't been confirmed yet. */
export async function getRenewal(tenantId: string): Promise<Renewal | null> {
  let row = await renewalRow(tenantId).catch(() => null);
  if (!row) return null;
  if (row.status === "created" && row.provider_ref) {
    const gw = await platformGateway(row.currency as string);
    if (gw && gw.provider === row.provider) {
      const s = await renewalStatus(gw, row.provider_ref as string).catch(() => null);
      if (s && s.state !== "created") {
        await db().from("plan_autorenew").update({ status: s.state, provider_sub_id: s.sub ?? row.provider_sub_id, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId);
        row = { ...row, status: s.state };
      }
    }
  }
  return {
    status: row.status as Renewal["status"],
    provider: row.provider as Provider,
    amount: fromMinor(row.amount_minor as number, row.currency as string),
    currency: row.currency as string,
    lastChargedAt: (row.last_charged_at as string) ?? undefined,
  };
}

/** Opens the gateway's page to start monthly renewal. The first month is charged when the paid time runs out. */
export async function startRenewal(
  tenantId: string,
  p: { amount: number; currency: string; business: string; firstChargeAt?: Date; email?: string; phone?: string },
): Promise<{ url: string } | { error: string }> {
  const gw = await platformGateway(p.currency);
  if (!gw) return { error: "Automatic renewal isn't set up yet." };
  const existing = await renewalRow(tenantId).catch(() => undefined);
  if (existing === undefined) return { error: "Automatic renewal switches on after the next database update." };
  if (existing?.status === "active") return { error: "Automatic renewal is already on." };
  try {
    const page = await createRenewal(gw, {
      amount: p.amount,
      currency: p.currency,
      name: `Toss Pro · ${p.business}`,
      tenant: tenantId,
      firstChargeAt: p.firstChargeAt,
      returnUrl: `${APP_URL}/admin/billing?renew=1`,
      cancelUrl: `${APP_URL}/admin/billing`,
      who: { name: p.business, email: p.email, phone: p.phone },
    });
    const { error } = await db()
      .from("plan_autorenew")
      .upsert(
        { tenant_id: tenantId, provider: gw.provider, currency: p.currency, amount_minor: toMinor(p.amount, p.currency), provider_ref: page.ref, provider_sub_id: page.sub ?? null, checkout_url: page.url, status: "created", updated_at: new Date().toISOString() },
        { onConflict: "tenant_id" },
      );
    if (error) return { error: "Automatic renewal switches on after the next database update." };
    return { url: page.url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError("plan renewal start failed", msg);
    if (/subscription|not enabled|feature|international/i.test(msg)) return { error: "Toss's payment account isn't ready for automatic renewal yet. Pay by month for now." };
    return { error: "The page couldn't be opened. Try again in a minute." };
  }
}

/** Stops automatic renewal: nothing more is charged; the time already paid for stays. */
export async function stopRenewal(tenantId: string): Promise<void> {
  const row = await renewalRow(tenantId);
  if (!row) return;
  const gw = await platformGateway(row.currency as string);
  if (gw && gw.provider === row.provider && row.provider_sub_id) await cancelRenewal(gw, row.provider_sub_id as string).catch((err) => logError("plan renewal cancel failed", err instanceof Error ? err.message : err));
  await db().from("plan_autorenew").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("tenant_id", tenantId);
}

/** A renewal webhook from Toss's own gateway: started, charged (extend the plan by a month), failing or ended. */
async function onRenewal(provider: Provider, event: GatewayEvent) {
  const r = event.renewal!;
  let row: Record<string, unknown> | null = null;
  if (r.sub) row = (await db().from("plan_autorenew").select("*").eq("provider_sub_id", r.sub).maybeSingle()).data;
  if (!row && r.session) row = (await db().from("plan_autorenew").select("*").eq("provider_ref", r.session).maybeSingle()).data;
  if (!row && r.sub) row = (await db().from("plan_autorenew").select("*").eq("provider_ref", r.sub).maybeSingle()).data;
  // Dodo's first message about a new subscription: matched by the business Toss put in its metadata
  if (!row && r.tenant && provider === "dodo") {
    row = (await db().from("plan_autorenew").select("*").eq("tenant_id", r.tenant).eq("provider", "dodo").is("provider_sub_id", null).maybeSingle()).data;
  }
  if (!row || row.provider !== provider) return;
  const tenantId = row.tenant_id as string;
  const now = new Date().toISOString();
  if (r.state !== "charged") {
    await db()
      .from("plan_autorenew")
      .update({ status: r.state, ...(r.sub ? { provider_sub_id: r.sub } : {}), updated_at: now })
      .eq("tenant_id", tenantId);
    return;
  }
  // a month was paid: the gateway must have charged exactly the monthly price Toss set up
  if (event.amountMinor !== row.amount_minor || (event.currency ?? "").toUpperCase() !== String(row.currency).toUpperCase()) {
    logError("plan renewal amount mismatch", { tenant: tenantId, expected: row.amount_minor, got: event.amountMinor, currency: event.currency });
    return;
  }
  const { data: pay, error } = await db()
    .from("subscription_payments")
    .insert({
      tenant_id: tenantId,
      months: 1,
      amount: fromMinor(event.amountMinor!, row.currency as string),
      discount_pct: 0,
      credit_used: 0,
      payment_ref: (event.paymentId ?? event.eventId).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 35),
      currency: row.currency,
    })
    .select("id")
    .single();
  if (error || !pay) throw error ?? new Error("renewal payment not recorded");
  const { error: e2 } = await db().rpc("review_subscription_payment", { p_id: pay.id, p_approve: true });
  if (e2) throw e2;
  await db()
    .from("plan_autorenew")
    .update({ status: "active", last_charged_at: now, updated_at: now, ...(r.sub ? { provider_sub_id: r.sub } : {}) })
    .eq("tenant_id", tenantId);
  await notifySubscriptionReviewed(pay.id as number);
}
