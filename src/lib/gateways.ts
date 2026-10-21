// Razorpay and Stripe, through their HTTP APIs (no SDKs). Each laundry uses its own account, so every call takes
// that account's keys. What matters for security:
//  - the amount always comes from Toss's database, never from the browser;
//  - a bill is marked paid only from a webhook whose signature checks out with the laundry's webhook secret, or
//    from Toss asking the gateway directly; the page the customer returns to proves nothing on its own;
//  - the paid amount and currency must equal what Toss asked for.
import { createHmac, timingSafeEqual } from "node:crypto";

export type Provider = "razorpay" | "stripe" | "dodo";
export interface GatewayKeys {
  provider: Provider;
  keyId?: string; // Razorpay key ID
  secret: string; // Razorpay key secret / Stripe secret key / Dodo API key
  webhookSecret?: string;
  /** Dodo: live or test API host */
  live?: boolean;
  /** Dodo: the products it charges for (made in its dashboard) */
  products?: { once?: string; monthly?: string };
}

/** The name people see. */
export const gatewayLabel = (p: string) => (p === "razorpay" ? "Razorpay" : p === "dodo" ? "Dodo Payments" : "Stripe");

// ---------- amounts in the gateway's smallest unit ----------
const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
const THREE_DECIMAL = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);
const factor = (currency: string) => (ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : THREE_DECIMAL.has(currency.toUpperCase()) ? 1000 : 100);
/** ₹281 → 28100 paise; $26.27 → 2627 cents; ¥3000 → 3000. */
export const toMinor = (amount: number, currency: string) => Math.round(amount * factor(currency));
export const fromMinor = (minor: number, currency: string) => minor / factor(currency);

// ---------- what a webhook (or a status check) tells us ----------
export interface GatewayEvent {
  eventId: string;
  /** a card-saving page finished (Stripe setup session / Razorpay mandate link): nothing was paid for a bill */
  setup?: boolean;
  /** something happened to an automatic plan renewal (a subscription on the gateway) */
  renewal?: { sub?: string; session?: string; tenant?: string; state: "active" | "charged" | "failing" | "cancelled" };
  type: string;
  ref?: string; // payment link id / checkout session id (our payment_intents.provider_ref)
  status: "paid" | "failed" | "expired" | "ignore";
  paymentId?: string;
  amountMinor?: number;
  currency?: string;
  method?: string;
}

const safeEqualHex = (a: string, b: string) => {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
};

// ================= Razorpay =================
const RZP = "https://api.razorpay.com/v1";
const rzpAuth = (k: GatewayKeys) => `Basic ${Buffer.from(`${k.keyId}:${k.secret}`).toString("base64")}`;

/** X-Razorpay-Signature: hex HMAC-SHA256 of the raw body with the webhook secret. */
export function verifyRazorpay(raw: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  return safeEqualHex(createHmac("sha256", secret).update(raw).digest("hex"), signature.trim());
}

export function parseRazorpay(raw: string, eventIdHeader: string | null): GatewayEvent {
  const e = JSON.parse(raw) as {
    event?: string;
    payload?: {
      payment_link?: { entity?: { id?: string; status?: string } };
      payment?: { entity?: { id?: string; amount?: number; currency?: string; method?: string; status?: string; order_id?: string; invoice_id?: string } };
      invoice?: { entity?: { id?: string; type?: string; status?: string } };
      subscription?: { entity?: { id?: string; status?: string; notes?: { toss_tenant?: string } | unknown[] } };
    };
  };
  const type = e.event ?? "";
  const link = e.payload?.payment_link?.entity;
  const pay = e.payload?.payment?.entity;
  const eventId = eventIdHeader || createHmac("sha256", "id").update(raw).digest("hex").slice(0, 32);
  // a plan renewal (Razorpay Subscriptions)
  if (type.startsWith("subscription.")) {
    const sub = e.payload?.subscription?.entity;
    const notes = sub?.notes && !Array.isArray(sub.notes) ? (sub.notes as { toss_tenant?: string }) : {};
    const state = ({ authenticated: "active", activated: "active", resumed: "active", charged: "charged", pending: "failing", halted: "failing", cancelled: "cancelled", completed: "cancelled", paused: "failing" } as const)[
      type.slice("subscription.".length) as "authenticated"
    ];
    if (!state || !sub?.id) return { eventId, type, status: "ignore" };
    return { eventId, type, status: "ignore", renewal: { sub: sub.id, tenant: notes.toss_tenant, state }, paymentId: pay?.id, amountMinor: pay?.amount, currency: pay?.currency?.toUpperCase(), method: pay?.method };
  }
  // a customer finished the card mandate page (Razorpay sends it as an invoice of type "link")
  if (type === "invoice.paid" && e.payload?.invoice?.entity?.id && !link) return { eventId, type, status: "ignore", setup: true, ref: e.payload.invoice.entity.id };
  // an automatic charge of a saved card: Toss made an order for it, so the order id is our reference
  if ((type === "payment.captured" || type === "payment.failed") && pay?.order_id && !pay.invoice_id) {
    return { eventId, type, ref: pay.order_id, status: type === "payment.captured" ? "paid" : "failed", paymentId: pay.id, amountMinor: pay.amount, currency: pay.currency?.toUpperCase(), method: pay.method };
  }
  const status = type === "payment_link.paid" ? "paid" : type === "payment_link.expired" ? "expired" : type === "payment_link.cancelled" ? "failed" : "ignore";
  return { eventId, type, ref: link?.id, status, paymentId: pay?.id, amountMinor: pay?.amount, currency: pay?.currency?.toUpperCase(), method: pay?.method };
}

async function rzp<T>(k: GatewayKeys, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${RZP}${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: rzpAuth(k), "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!res.ok) throw new Error(`Razorpay: ${data.error?.description ?? res.status}`);
  return data;
}

// ================= Stripe =================
const STRIPE = "https://api.stripe.com/v1";

/** Stripe-Signature: "t=…,v1=…": hex HMAC-SHA256 of "t.raw" with the endpoint secret; rejected if older than 5 minutes. */
export function verifyStripe(raw: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v ?? "");
  if (!Number.isFinite(t) || !sigs.length || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return sigs.some((s) => safeEqualHex(expected, s));
}

type StripeSession = {
  mode?: string;
  object?: string;
  amount_received?: number;
  id?: string;
  payment_status?: string;
  status?: string;
  amount_total?: number;
  currency?: string;
  payment_intent?: string | { id?: string };
  payment_method_types?: string[];
  subscription?: string | { id?: string };
  client_reference_id?: string;
  // invoices (plan renewals)
  amount_paid?: number;
  parent?: { subscription_details?: { subscription?: string } };
};
const idOf = (x?: string | { id?: string }) => (typeof x === "string" ? x : x?.id);

function fromSession(o: StripeSession, eventId: string, type: string, status: GatewayEvent["status"]): GatewayEvent {
  const pi = typeof o.payment_intent === "string" ? o.payment_intent : o.payment_intent?.id;
  return { eventId, type, ref: o.id, status, paymentId: pi ?? o.id, amountMinor: o.amount_total, currency: o.currency?.toUpperCase(), method: o.payment_method_types?.[0] };
}

export function parseStripe(raw: string): GatewayEvent {
  const e = JSON.parse(raw) as { id?: string; type?: string; data?: { object?: StripeSession } };
  const type = e.type ?? "";
  const o = e.data?.object ?? {};
  if (type === "checkout.session.completed" && o.mode === "setup") return { eventId: e.id ?? "", type, ref: o.id, status: "ignore", setup: true };
  // plan renewals: the subscription started, a month was paid, a payment failed, or it ended
  if (type === "checkout.session.completed" && o.mode === "subscription") {
    return { eventId: e.id ?? "", type, status: "ignore", renewal: { session: o.id, sub: idOf(o.subscription), tenant: o.client_reference_id, state: "active" } };
  }
  if (type === "invoice.paid" || type === "invoice.payment_failed") {
    const sub = idOf(o.subscription) ?? o.parent?.subscription_details?.subscription;
    if (!sub) return { eventId: e.id ?? "", type, status: "ignore" };
    const charged = type === "invoice.paid" && (o.amount_paid ?? 0) > 0;
    if (type === "invoice.paid" && !charged) return { eventId: e.id ?? "", type, status: "ignore", renewal: { sub, state: "active" } }; // the free first days
    return { eventId: e.id ?? "", type, status: "ignore", renewal: { sub, state: charged ? "charged" : "failing" }, paymentId: o.id, amountMinor: o.amount_paid, currency: o.currency?.toUpperCase(), method: "card" };
  }
  if (type === "customer.subscription.deleted") return { eventId: e.id ?? "", type, status: "ignore", renewal: { sub: o.id, state: "cancelled" } };
  // automatic charges of a saved card (off-session payment intents)
  if (type === "payment_intent.succeeded" || type === "payment_intent.payment_failed") {
    return {
      eventId: e.id ?? "",
      type,
      ref: o.id,
      status: type === "payment_intent.succeeded" ? "paid" : "failed",
      paymentId: o.id,
      amountMinor: o.amount_received ?? o.amount_total,
      currency: o.currency?.toUpperCase(),
      method: o.payment_method_types?.[0],
    };
  }
  const status =
    type === "checkout.session.completed"
      ? o.payment_status === "paid" || o.payment_status === "no_payment_required"
        ? "paid"
        : "ignore" // a bank debit still clearing: the async_payment_* event follows
      : type === "checkout.session.async_payment_succeeded"
        ? "paid"
        : type === "checkout.session.async_payment_failed"
          ? "failed"
          : type === "checkout.session.expired"
            ? "expired"
            : "ignore";
  return fromSession(o, e.id ?? "", type, status);
}

/** Stripe's API takes form-encoded bodies with bracketed keys. */
function form(obj: Record<string, string | number | undefined>): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

async function stripe<T>(k: GatewayKeys, path: string, init?: { method?: string; body?: Record<string, string | number | undefined> }): Promise<T> {
  const res = await fetch(`${STRIPE}${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${k.secret}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2024-06-20" },
    body: init?.body ? form(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Stripe: ${data.error?.message ?? res.status}`);
  return data;
}

// ================= one interface for both =================
export interface CheckoutRequest {
  amount: number; // in the currency's units (₹281, $26.27)
  currency: string;
  description: string; // "Laundry pickup #104 · Fresh Fold"
  reference: string; // our payment_intents id
  returnUrl: string; // where the customer comes back to (shows the status Toss confirms)
  cancelUrl: string;
  customer?: { name?: string; email?: string; phone?: string };
}

/** Creates a hosted payment page for exactly this amount. Returns its id (for payment_intents) and URL. */
export async function createCheckout(k: GatewayKeys, r: CheckoutRequest): Promise<{ ref: string; url: string }> {
  const minor = toMinor(r.amount, r.currency);
  if (k.provider === "dodo") return dodoCheckout(k, r, minor);
  if (k.provider === "razorpay") {
    const link = await rzp<{ id: string; short_url: string }>(k, "/payment_links", {
      method: "POST",
      body: {
        amount: minor,
        currency: r.currency.toUpperCase(),
        accept_partial: false,
        reference_id: r.reference.replace(/-/g, "").slice(0, 40),
        description: r.description.slice(0, 2048),
        customer: r.customer ? { name: r.customer.name, email: r.customer.email, contact: r.customer.phone } : undefined,
        notify: { sms: false, email: false },
        reminder_enable: false,
        notes: { toss_intent: r.reference },
        callback_url: r.returnUrl,
        callback_method: "get",
        expire_by: Math.floor(Date.now() / 1000) + 2 * 86_400,
      },
    });
    return { ref: link.id, url: link.short_url };
  }
  const s = await stripe<{ id: string; url: string }>(k, "/checkout/sessions", {
    method: "POST",
    body: {
      mode: "payment",
      "line_items[0][price_data][currency]": r.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": minor,
      "line_items[0][price_data][product_data][name]": r.description.slice(0, 250),
      "line_items[0][quantity]": 1,
      success_url: r.returnUrl,
      cancel_url: r.cancelUrl,
      client_reference_id: r.reference,
      "metadata[toss_intent]": r.reference,
      "payment_intent_data[metadata][toss_intent]": r.reference,
      customer_email: r.customer?.email,
      expires_at: Math.floor(Date.now() / 1000) + 23 * 3600,
    },
  });
  return { ref: s.id, url: s.url };
}

/** Asks the gateway itself whether a payment page was paid (used when the webhook is late or lost). */
export async function checkoutStatus(k: GatewayKeys, ref: string): Promise<GatewayEvent> {
  if (k.provider === "dodo") return dodoCheckoutStatus(k, ref);
  if (k.provider === "razorpay" && ref.startsWith("order_")) {
    const r = await rzp<{ items?: { id: string; status: string; amount: number; currency: string; method?: string }[] }>(k, `/orders/${encodeURIComponent(ref)}/payments`);
    const items = r.items ?? [];
    const p = items.find((x) => x.status === "captured");
    const status = p ? "paid" : items.length && items.every((x) => x.status === "failed") ? "failed" : "ignore";
    return { eventId: `check:${ref}`, type: "status.order", ref, status, paymentId: p?.id, amountMinor: p?.amount, currency: p?.currency?.toUpperCase(), method: p?.method };
  }
  if (k.provider === "razorpay") {
    const l = await rzp<{ id: string; status: string; currency: string; payments?: { payment_id: string; amount: number; status: string; method?: string }[] | null }>(
      k,
      `/payment_links/${encodeURIComponent(ref)}`,
    );
    const p = (l.payments ?? []).find((x) => x.status === "captured");
    const status = l.status === "paid" && p ? "paid" : l.status === "expired" ? "expired" : l.status === "cancelled" ? "failed" : "ignore";
    return { eventId: `check:${ref}`, type: `status.${l.status}`, ref: l.id, status, paymentId: p?.payment_id, amountMinor: p?.amount, currency: l.currency?.toUpperCase(), method: p?.method };
  }
  if (ref.startsWith("pi_")) {
    const pi = await stripe<{ id: string; status: string; amount_received?: number; currency?: string; payment_method_types?: string[] }>(k, `/payment_intents/${encodeURIComponent(ref)}`);
    const st = pi.status === "succeeded" ? "paid" : pi.status === "canceled" || pi.status === "requires_payment_method" ? "failed" : "ignore";
    return { eventId: `check:${ref}`, type: `status.${pi.status}`, ref, status: st, paymentId: pi.id, amountMinor: pi.amount_received, currency: pi.currency?.toUpperCase(), method: pi.payment_method_types?.[0] };
  }
  const s = await stripe<StripeSession>(k, `/checkout/sessions/${encodeURIComponent(ref)}`);
  const status = s.payment_status === "paid" ? "paid" : s.status === "expired" ? "expired" : "ignore";
  return fromSession(s, `check:${ref}`, `status.${s.status}`, status);
}

/** Checks that the keys work (and are allowed to create payment pages). Returns whether they're live keys. */
export async function testKeys(k: GatewayKeys): Promise<{ live: boolean }> {
  if (k.provider === "dodo") return dodoTestKey(k);
  if (k.provider === "razorpay") {
    if (!/^rzp_(test|live)_[A-Za-z0-9]{6,}$/.test(k.keyId ?? "")) throw new Error("A Razorpay key ID starts with rzp_test_ or rzp_live_.");
    await rzp(k, "/payment_links?count=1");
    return { live: k.keyId!.startsWith("rzp_live_") };
  }
  if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/.test(k.secret)) throw new Error("A Stripe secret key starts with sk_test_, sk_live_ or rk_ (restricted).");
  await stripe(k, "/checkout/sessions?limit=1");
  return { live: /_live_/.test(k.secret) };
}

/** Stripe only: registers Toss's webhook URL on the laundry's account and returns its signing secret. */
export async function createStripeWebhook(k: GatewayKeys, url: string): Promise<{ id: string; secret: string }> {
  const events = [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "checkout.session.expired",
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "invoice.paid",
    "invoice.payment_failed",
    "customer.subscription.deleted",
  ];
  const body: Record<string, string> = { url, description: "Toss: confirms laundry payments automatically", api_version: "2024-06-20" };
  events.forEach((e, i) => (body[`enabled_events[${i}]`] = e));
  const w = await stripe<{ id: string; secret: string }>(k, "/webhook_endpoints", { method: "POST", body });
  return { id: w.id, secret: w.secret };
}

export async function deleteStripeWebhook(k: GatewayKeys, id: string): Promise<void> {
  await stripe(k, `/webhook_endpoints/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
}

// ================= saved cards (Stripe): how laundry apps abroad work =================
// The customer saves a card (or Apple Pay / Google Pay) once; each bill is then charged automatically when the
// laundry is ready, with their chosen tip, and they get a receipt. Strong customer authentication (Europe) is
// handled by Stripe at save time; if a bank still asks for it on a charge, the bill stays open to pay by hand.

/** A Stripe customer on the laundry's account, for one Toss customer. */
export async function createStripeCustomer(k: GatewayKeys, c: { email?: string; name?: string; tossCustomer: string }): Promise<string> {
  const r = await stripe<{ id: string }>(k, "/customers", { method: "POST", body: { email: c.email, name: c.name, "metadata[toss_customer]": c.tossCustomer } });
  return r.id;
}

/** A Stripe page where the customer saves a card / wallet for later charges. */
export async function createCardSetup(k: GatewayKeys, r: { customer: string; currency: string; returnUrl: string; cancelUrl: string }): Promise<{ ref: string; url: string }> {
  const s = await stripe<{ id: string; url: string }>(k, "/checkout/sessions", {
    method: "POST",
    body: { mode: "setup", customer: r.customer, currency: r.currency.toLowerCase(), success_url: r.returnUrl, cancel_url: r.cancelUrl },
  });
  return { ref: s.id, url: s.url };
}

/** What the customer saved on a setup page (null until it's done). */
export async function cardFromSetup(k: GatewayKeys, sessionId: string): Promise<{ paymentMethod: string; brand?: string; last4?: string; exp?: string } | null> {
  const s = await stripe<{ status?: string; setup_intent?: { status?: string; payment_method?: { id: string; type?: string; card?: { brand?: string; last4?: string; exp_month?: number; exp_year?: number } } } }>(
    k,
    `/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=setup_intent.payment_method`,
  );
  const pm = s.setup_intent?.status === "succeeded" ? s.setup_intent.payment_method : undefined;
  if (!pm) return null;
  const c = pm.card;
  return { paymentMethod: pm.id, brand: c?.brand ?? pm.type, last4: c?.last4, exp: c?.exp_month ? `${String(c.exp_month).padStart(2, "0")}/${String(c.exp_year).slice(-2)}` : undefined };
}

/** Charges a saved card now, without the customer present. Returns the payment intent and its status. */
export async function chargeSavedCard(
  k: GatewayKeys,
  r: { amountMinor: number; currency: string; customer: string; paymentMethod: string; description: string; reference: string },
): Promise<{ id?: string; status: string; amountMinor?: number; error?: string }> {
  const res = await fetch(`${STRIPE}/payment_intents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${k.secret}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2024-06-20", "Idempotency-Key": `toss-${r.reference}` },
    body: form({
      amount: r.amountMinor,
      currency: r.currency.toLowerCase(),
      customer: r.customer,
      payment_method: r.paymentMethod,
      off_session: "true",
      confirm: "true",
      description: r.description.slice(0, 500),
      "metadata[toss_intent]": r.reference,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; status?: string; amount_received?: number; error?: { message?: string; payment_intent?: { id?: string; status?: string } } };
  if (res.ok) return { id: data.id, status: data.status ?? "unknown", amountMinor: data.amount_received };
  // declined, or the bank wants the customer to confirm: Stripe still returns the payment intent
  return { id: data.error?.payment_intent?.id, status: data.error?.payment_intent?.status ?? "failed", error: data.error?.message };
}

// ================= saved cards (Razorpay): automatic bill payments in India =================
// RBI's rules for cards kept for later charges: the customer approves a mandate once on Razorpay's page (up to a
// maximum per charge), and the bank tells them about each charge a day before it's taken. The laundry's Razorpay
// account needs Recurring Payments switched on (ask Razorpay support; it's free).

/** The most one automatic charge can be without asking the customer again (RBI's limit for card mandates). */
export const RZP_MANDATE_MAX_MINOR = 1_500_000; // ₹15,000

type Who = { name?: string; email?: string; phone?: string };
const contact = (phone?: string) => (phone ? phone.replace(/[^\d+]/g, "") : undefined);

/** Razorpay's page where the customer approves automatic card charges. Returns its id (inv_…) and URL. */
export async function createRazorpayMandate(k: GatewayKeys, r: { who: Who; description: string; reference: string; returnUrl: string }): Promise<{ ref: string; url: string }> {
  const now = Math.floor(Date.now() / 1000);
  const link = await rzp<{ id: string; short_url: string }>(k, "/subscription_registration/auth_links", {
    method: "POST",
    body: {
      customer: { name: (r.who.name || "Customer").slice(0, 50), email: r.who.email, contact: contact(r.who.phone) },
      type: "link",
      amount: 100, // ₹1 to check the card, as Razorpay asks for card mandates
      currency: "INR",
      description: r.description.slice(0, 255),
      subscription_registration: { method: "card", max_amount: RZP_MANDATE_MAX_MINOR, frequency: "as_presented", expire_at: now + 10 * 365 * 86_400 },
      receipt: r.reference.replace(/-/g, "").slice(0, 40),
      sms_notify: 0,
      email_notify: 0,
      expire_by: now + 2 * 86_400,
      notes: { toss_setup: r.reference },
      callback_url: r.returnUrl,
      callback_method: "get",
    },
  });
  return { ref: link.id, url: link.short_url };
}

/** What the customer saved on a mandate page: Razorpay's customer and card token (null until it's done). */
export async function razorpayMandateResult(k: GatewayKeys, linkId: string): Promise<{ customer: string; token: string; brand?: string; last4?: string; exp?: string } | null> {
  const inv = await rzp<{ status?: string; payment_id?: string; customer_id?: string }>(k, `/invoices/${encodeURIComponent(linkId)}`);
  if (inv.status !== "paid" || !inv.payment_id) return null;
  const pay = await rzp<{ token_id?: string; customer_id?: string }>(k, `/payments/${encodeURIComponent(inv.payment_id)}`);
  const customer = pay.customer_id ?? inv.customer_id;
  if (!pay.token_id || !customer) return null;
  const tok = await rzp<{ card?: { network?: string; last4?: string; expiry_month?: number; expiry_year?: number } }>(
    k,
    `/customers/${encodeURIComponent(customer)}/tokens/${encodeURIComponent(pay.token_id)}`,
  ).catch(() => ({}) as { card?: undefined });
  const c = tok.card;
  return { customer, token: pay.token_id, brand: c?.network, last4: c?.last4, exp: c?.expiry_month ? `${String(c.expiry_month).padStart(2, "0")}/${String(c.expiry_year).slice(-2)}` : undefined };
}

/**
 * Charges a saved card: an order for the amount, then a recurring payment on it. Razorpay sends the bank's
 * pre-debit notice and takes the money about a day later; the payment.captured webhook (or the daily check of the
 * order) settles the bill. Returns the order id, which is our reference for this payment.
 */
export async function chargeRazorpayToken(
  k: GatewayKeys,
  r: { amountMinor: number; customer: string; token: string; description: string; reference: string; who: Who },
): Promise<{ ref?: string; error?: string }> {
  try {
    const order = await rzp<{ id: string }>(k, "/orders", {
      method: "POST",
      body: { amount: r.amountMinor, currency: "INR", receipt: r.reference.replace(/-/g, "").slice(0, 40), payment_capture: 1, notes: { toss_intent: r.reference } },
    });
    await rzp(k, "/payments/create/recurring", {
      method: "POST",
      body: {
        email: r.who.email,
        contact: contact(r.who.phone),
        amount: r.amountMinor,
        currency: "INR",
        order_id: order.id,
        customer_id: r.customer,
        token: r.token,
        recurring: "1",
        description: r.description.slice(0, 255),
        notes: { toss_intent: r.reference },
      },
    });
    return { ref: order.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ================= automatic plan renewal (a subscription on Toss's own gateway) =================

export interface RenewalRequest {
  amount: number; // each month, in the currency's units
  currency: string;
  name: string; // "Toss Pro · Fresh Fold"
  tenant: string; // our tenant id
  firstChargeAt?: Date; // when the first month should be charged (the end of what they've already paid for)
  returnUrl: string;
  cancelUrl: string;
  who: Who;
}

/** Opens the gateway's page to start a monthly subscription. Returns its reference, URL and (Razorpay) the subscription id. */
export async function createRenewal(k: GatewayKeys, r: RenewalRequest): Promise<{ ref: string; url: string; sub?: string }> {
  const minor = toMinor(r.amount, r.currency);
  const later = r.firstChargeAt && r.firstChargeAt.getTime() > Date.now() + 2 * 86_400_000 ? Math.floor(r.firstChargeAt.getTime() / 1000) : undefined;
  if (k.provider === "dodo") return dodoRenewal(k, r, minor, later);
  if (k.provider === "razorpay") {
    const plan = await rzp<{ id: string }>(k, "/plans", {
      method: "POST",
      body: { period: "monthly", interval: 1, item: { name: r.name.slice(0, 100), amount: minor, currency: r.currency.toUpperCase() }, notes: { toss_tenant: r.tenant } },
    });
    const sub = await rzp<{ id: string; short_url: string }>(k, "/subscriptions", {
      method: "POST",
      body: { plan_id: plan.id, total_count: 120, quantity: 1, customer_notify: 1, start_at: later, notes: { toss_tenant: r.tenant } },
    });
    return { ref: sub.id, url: sub.short_url, sub: sub.id };
  }
  const s = await stripe<{ id: string; url: string }>(k, "/checkout/sessions", {
    method: "POST",
    body: {
      mode: "subscription",
      "line_items[0][price_data][currency]": r.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": minor,
      "line_items[0][price_data][product_data][name]": r.name.slice(0, 250),
      "line_items[0][price_data][recurring][interval]": "month",
      "line_items[0][quantity]": 1,
      success_url: r.returnUrl,
      cancel_url: r.cancelUrl,
      client_reference_id: r.tenant,
      "subscription_data[metadata][toss_tenant]": r.tenant,
      "subscription_data[trial_end]": later,
      customer_email: r.who.email,
    },
  });
  return { ref: s.id, url: s.url };
}

/** Where a renewal stands, asked of the gateway (for when the manager comes back before the webhook). */
export async function renewalStatus(k: GatewayKeys, ref: string): Promise<{ sub?: string; state: "created" | "active" | "failing" | "cancelled" }> {
  if (k.provider === "dodo") {
    const s = await dodo<{ payment_status?: string | null }>(k, `/checkouts/${encodeURIComponent(ref)}`);
    return { state: s.payment_status === "succeeded" ? "active" : "created" };
  }
  if (k.provider === "razorpay") {
    const s = await rzp<{ id: string; status: string }>(k, `/subscriptions/${encodeURIComponent(ref)}`);
    const state = ["authenticated", "active"].includes(s.status) ? "active" : ["pending", "halted", "paused"].includes(s.status) ? "failing" : ["cancelled", "completed", "expired"].includes(s.status) ? "cancelled" : "created";
    return { sub: s.id, state };
  }
  const s = await stripe<StripeSession>(k, `/checkout/sessions/${encodeURIComponent(ref)}`);
  return s.status === "complete" && idOf(s.subscription) ? { sub: idOf(s.subscription), state: "active" } : { state: s.status === "expired" ? "cancelled" : "created" };
}

/** Stops a renewal now: nothing more is charged (the time already paid for stays). */
export async function cancelRenewal(k: GatewayKeys, sub: string): Promise<void> {
  if (k.provider === "dodo") await dodo(k, `/subscriptions/${encodeURIComponent(sub)}`, { method: "PATCH", body: { status: "cancelled" } });
  else if (k.provider === "razorpay") await rzp(k, `/subscriptions/${encodeURIComponent(sub)}/cancel`, { method: "POST", body: { cancel_at_cycle_end: 0 } });
  else await stripe(k, `/subscriptions/${encodeURIComponent(sub)}`, { method: "DELETE" });
}

// ================= Dodo Payments (Toss's own US-dollar billing) =================
// A merchant of record: the laundry buys from Dodo, Dodo adds and pays the sales tax, and pays Toss out in India.
// Prices live on products in Dodo's dashboard: a "pay what you want" one-time product (Toss sets each amount, for
// 1–12 months) and a monthly subscription product. Amounts Dodo reports include tax, so Toss checks them before tax.
const DODO = { live: "https://live.dodopayments.com", test: "https://test.dodopayments.com" };

async function dodo<T>(k: GatewayKeys, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${k.live ? DODO.live : DODO.test}${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${k.secret}`, "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string | { message?: string } };
  if (!res.ok) {
    const msg = typeof data.error === "object" ? data.error?.message : (data.message ?? data.error);
    throw new Error(`Dodo: ${msg ?? (res.status === 401 ? "authentication failed" : res.status)}`);
  }
  return data;
}

/** Standard Webhooks: base64 HMAC-SHA256 of "id.timestamp.body" with the secret (whsec_ + base64 key); 5 minutes' leeway. */
export function verifyDodo(raw: string, h: { id: string | null; timestamp: string | null; signature: string | null }, secret: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (!h.id || !h.timestamp || !h.signature || !secret) return false;
  const t = Number(h.timestamp);
  if (!Number.isFinite(t) || Math.abs(nowSec - t) > 300) return false;
  const key = secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : Buffer.from(secret, "utf8");
  const expected = Buffer.from(createHmac("sha256", key).update(`${h.id}.${h.timestamp}.${raw}`).digest("base64"));
  return h.signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    const got = Buffer.from(sig ?? "");
    return version === "v1" && got.length === expected.length && timingSafeEqual(got, expected);
  });
}

type DodoPayment = {
  payment_id?: string;
  status?: string | null;
  total_amount?: number;
  tax?: number | null;
  currency?: string;
  subscription_id?: string | null;
  checkout_session_id?: string | null;
  payment_method?: string | null;
  metadata?: Record<string, unknown>;
};
type DodoSubscription = { subscription_id?: string; status?: string; metadata?: Record<string, unknown> };
const beforeTax = (p: DodoPayment) => (typeof p.total_amount === "number" ? p.total_amount - (p.tax ?? 0) : undefined);
const meta = (m: Record<string, unknown> | undefined, k: string) => (typeof m?.[k] === "string" ? (m[k] as string) : undefined);

export function parseDodo(raw: string, webhookId: string | null): GatewayEvent {
  const e = JSON.parse(raw) as { type?: string; data?: DodoPayment & DodoSubscription };
  const type = e.type ?? "";
  const d = e.data ?? {};
  const eventId = webhookId || createHmac("sha256", "id").update(raw).digest("hex").slice(0, 32);
  if (type === "payment.succeeded" || type === "payment.failed") {
    const ok = type === "payment.succeeded";
    const money = { paymentId: d.payment_id, amountMinor: beforeTax(d), currency: d.currency?.toUpperCase(), method: d.payment_method ?? "card" };
    // a month of an automatic renewal
    if (d.subscription_id) return { eventId, type, status: "ignore", renewal: { sub: d.subscription_id, tenant: meta(d.metadata, "toss_tenant"), state: ok ? "charged" : "failing" }, ...money };
    return { eventId, type, ref: d.checkout_session_id ?? undefined, status: ok ? "paid" : "failed", ...money };
  }
  const state = ({ "subscription.active": "active", "subscription.on_hold": "failing", "subscription.past_due": "failing", "subscription.failed": "failing", "subscription.cancelled": "cancelled", "subscription.expired": "cancelled" } as const)[
    type as "subscription.active"
  ];
  if (state && d.subscription_id) return { eventId, type, status: "ignore", renewal: { sub: d.subscription_id, tenant: meta(d.metadata, "toss_tenant"), state } };
  return { eventId, type, status: "ignore" };
}

async function dodoCheckout(k: GatewayKeys, r: CheckoutRequest, minor: number): Promise<{ ref: string; url: string }> {
  if (!k.products?.once) throw new Error("Dodo: no one-time product is set up");
  const s = await dodo<{ session_id: string; checkout_url: string | null }>(k, "/checkouts", {
    method: "POST",
    body: {
      product_cart: [{ product_id: k.products.once, quantity: 1, amount: minor }],
      customer: r.customer?.email ? { email: r.customer.email, name: r.customer.name ?? r.customer.email } : undefined,
      return_url: r.returnUrl,
      metadata: { toss_intent: r.reference },
    },
  });
  if (!s.checkout_url) throw new Error("Dodo: no checkout page returned");
  return { ref: s.session_id, url: s.checkout_url };
}

async function dodoCheckoutStatus(k: GatewayKeys, ref: string): Promise<GatewayEvent> {
  const s = await dodo<{ payment_id?: string | null; payment_status?: string | null }>(k, `/checkouts/${encodeURIComponent(ref)}`);
  if (!s.payment_id || !s.payment_status) return { eventId: `check:${ref}`, type: "status.open", ref, status: "ignore" };
  if (s.payment_status !== "succeeded") {
    const failed = ["failed", "cancelled"].includes(s.payment_status);
    return { eventId: `check:${ref}`, type: `status.${s.payment_status}`, ref, status: failed ? "failed" : "ignore" };
  }
  const p = await dodo<DodoPayment>(k, `/payments/${encodeURIComponent(s.payment_id)}`);
  return { eventId: `check:${ref}`, type: "status.succeeded", ref, status: "paid", paymentId: p.payment_id, amountMinor: beforeTax(p), currency: p.currency?.toUpperCase(), method: p.payment_method ?? "card" };
}

/** Dodo keys don't say which mode they're for: try live, then test. */
async function dodoTestKey(k: GatewayKeys): Promise<{ live: boolean }> {
  if (k.secret.length < 20) throw new Error("That doesn't look like a Dodo API key.");
  try {
    await dodo({ ...k, live: true }, "/products?page_size=1");
    return { live: true };
  } catch {
    await dodo({ ...k, live: false }, "/products?page_size=1");
    return { live: false };
  }
}

type DodoProduct = { product_id: string; is_recurring: boolean; price?: number | null; currency?: string | null; price_detail?: { pay_what_you_want?: boolean } | null };

/** Finds the two products and checks they're the right kinds. Returns what's wrong, or null. */
export async function checkDodoProducts(k: GatewayKeys): Promise<string | null> {
  const r = await dodo<{ items: DodoProduct[] }>(k, "/products?page_size=100");
  const once = r.items.find((p) => p.product_id === k.products?.once);
  const monthly = r.items.find((p) => p.product_id === k.products?.monthly);
  if (!once) return "Toss couldn't find the one-time product. Copy its ID from Dodo → Products.";
  if (once.is_recurring) return "The one-time product is a subscription. Make a one-time product with Pay What You Want turned on.";
  if (once.price_detail && once.price_detail.pay_what_you_want === false) return "Turn on Pay What You Want for the one-time product, so Toss can charge 1, 3, 6 or 12 months.";
  if (k.products?.monthly && !monthly) return "Toss couldn't find the monthly product. Copy its ID from Dodo → Products.";
  if (monthly && !monthly.is_recurring) return "The monthly product must be a subscription (billed every month).";
  return null;
}

async function dodoRenewal(k: GatewayKeys, r: RenewalRequest, minor: number, laterSec?: number): Promise<{ ref: string; url: string }> {
  if (!k.products?.monthly) throw new Error("Dodo: no monthly product is set up");
  // the monthly product's own price is what gets charged: it must be Toss's monthly price
  const list = await dodo<{ items: DodoProduct[] }>(k, "/products?page_size=100&recurring=true");
  const product = list.items.find((p) => p.product_id === k.products!.monthly);
  if (!product || product.price !== minor || (product.currency ?? "").toUpperCase() !== r.currency.toUpperCase()) {
    throw new Error("Dodo: the monthly product's price doesn't match this plan's price");
  }
  const trialDays = laterSec ? Math.ceil((laterSec * 1000 - Date.now()) / 86_400_000) : 0;
  const s = await dodo<{ session_id: string; checkout_url: string | null }>(k, "/checkouts", {
    method: "POST",
    body: {
      product_cart: [{ product_id: k.products.monthly, quantity: 1 }],
      customer: r.who.email ? { email: r.who.email, name: r.who.name ?? r.who.email } : undefined,
      return_url: r.returnUrl,
      metadata: { toss_tenant: r.tenant, toss_renewal: "1" },
      subscription_data: trialDays > 0 ? { trial_period_days: trialDays } : undefined,
    },
  });
  if (!s.checkout_url) throw new Error("Dodo: no checkout page returned");
  return { ref: s.session_id, url: s.checkout_url };
}
