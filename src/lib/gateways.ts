// Razorpay and Stripe, through their HTTP APIs (no SDKs). Each laundry uses its own account, so every call takes
// that account's keys. What matters for security:
//  - the amount always comes from Toss's database, never from the browser;
//  - a bill is marked paid only from a webhook whose signature checks out with the laundry's webhook secret, or
//    from Toss asking the gateway directly; the page the customer returns to proves nothing on its own;
//  - the paid amount and currency must equal what Toss asked for.
import { createHmac, timingSafeEqual } from "node:crypto";

export type Provider = "razorpay" | "stripe";
export interface GatewayKeys {
  provider: Provider;
  keyId?: string; // Razorpay key ID
  secret: string; // Razorpay key secret / Stripe secret key
  webhookSecret?: string;
}

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
    payload?: { payment_link?: { entity?: { id?: string; status?: string } }; payment?: { entity?: { id?: string; amount?: number; currency?: string; method?: string; status?: string } } };
  };
  const type = e.event ?? "";
  const link = e.payload?.payment_link?.entity;
  const pay = e.payload?.payment?.entity;
  const eventId = eventIdHeader || createHmac("sha256", "id").update(raw).digest("hex").slice(0, 32);
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

type StripeSession = { id?: string; payment_status?: string; status?: string; amount_total?: number; currency?: string; payment_intent?: string | { id?: string }; payment_method_types?: string[] };

function fromSession(o: StripeSession, eventId: string, type: string, status: GatewayEvent["status"]): GatewayEvent {
  const pi = typeof o.payment_intent === "string" ? o.payment_intent : o.payment_intent?.id;
  return { eventId, type, ref: o.id, status, paymentId: pi ?? o.id, amountMinor: o.amount_total, currency: o.currency?.toUpperCase(), method: o.payment_method_types?.[0] };
}

export function parseStripe(raw: string): GatewayEvent {
  const e = JSON.parse(raw) as { id?: string; type?: string; data?: { object?: StripeSession } };
  const type = e.type ?? "";
  const o = e.data?.object ?? {};
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
  if (k.provider === "razorpay") {
    const l = await rzp<{ id: string; status: string; currency: string; payments?: { payment_id: string; amount: number; status: string; method?: string }[] | null }>(
      k,
      `/payment_links/${encodeURIComponent(ref)}`,
    );
    const p = (l.payments ?? []).find((x) => x.status === "captured");
    const status = l.status === "paid" && p ? "paid" : l.status === "expired" ? "expired" : l.status === "cancelled" ? "failed" : "ignore";
    return { eventId: `check:${ref}`, type: `status.${l.status}`, ref: l.id, status, paymentId: p?.payment_id, amountMinor: p?.amount, currency: l.currency?.toUpperCase(), method: p?.method };
  }
  const s = await stripe<StripeSession>(k, `/checkout/sessions/${encodeURIComponent(ref)}`);
  const status = s.payment_status === "paid" ? "paid" : s.status === "expired" ? "expired" : "ignore";
  return fromSession(s, `check:${ref}`, `status.${s.status}`, status);
}

/** Checks that the keys work (and are allowed to create payment pages). Returns whether they're live keys. */
export async function testKeys(k: GatewayKeys): Promise<{ live: boolean }> {
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
  const events = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"];
  const body: Record<string, string> = { url, description: "Toss: confirms laundry payments automatically" };
  events.forEach((e, i) => (body[`enabled_events[${i}]`] = e));
  const w = await stripe<{ id: string; secret: string }>(k, "/webhook_endpoints", { method: "POST", body });
  return { id: w.id, secret: w.secret };
}

export async function deleteStripeWebhook(k: GatewayKeys, id: string): Promise<void> {
  await stripe(k, `/webhook_endpoints/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
}
