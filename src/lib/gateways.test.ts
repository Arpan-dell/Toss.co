import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fromMinor, parseDodo, parseRazorpay, parseStripe, toMinor, verifyDodo, verifyRazorpay, verifyStripe } from "./gateways";

// fake secrets: test data only
const RZP_SECRET = "rzp-webhook-secret-not-real";
const STRIPE_SECRET = "whsec_test_not_a_real_secret";

const rzpPaid = JSON.stringify({
  event: "payment_link.paid",
  payload: {
    payment_link: { entity: { id: "plink_TEST123", status: "paid", amount: 28100, currency: "INR" } },
    payment: { entity: { id: "pay_TEST456", amount: 28100, currency: "INR", method: "upi", status: "captured" } },
  },
});
const stripeEvent = (type: string, object: object) => JSON.stringify({ id: "evt_TEST1", type, data: { object } });
const stripeHeader = (raw: string, t: number, secret = STRIPE_SECRET) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`;

describe("Razorpay webhooks", () => {
  const sig = createHmac("sha256", RZP_SECRET).update(rzpPaid).digest("hex");
  it("accepts only the gateway's signature on the exact body", () => {
    expect(verifyRazorpay(rzpPaid, sig, RZP_SECRET)).toBe(true);
    expect(verifyRazorpay(rzpPaid.replace("28100", "100"), sig, RZP_SECRET)).toBe(false); // amount changed
    expect(verifyRazorpay(rzpPaid, sig, "another-laundrys-secret")).toBe(false);
    expect(verifyRazorpay(rzpPaid, null, RZP_SECRET)).toBe(false);
    expect(verifyRazorpay(rzpPaid, "zz", RZP_SECRET)).toBe(false);
  });
  it("reads a paid payment link", () => {
    expect(parseRazorpay(rzpPaid, "evt_rzp_1")).toEqual({
      eventId: "evt_rzp_1",
      type: "payment_link.paid",
      ref: "plink_TEST123",
      status: "paid",
      paymentId: "pay_TEST456",
      amountMinor: 28100,
      currency: "INR",
      method: "upi",
    });
    expect(parseRazorpay(JSON.stringify({ event: "payment.authorized" }), "e").status).toBe("ignore");
  });
});

describe("Stripe webhooks", () => {
  const now = 1_790_000_000;
  const paid = stripeEvent("checkout.session.completed", { id: "cs_test_1", payment_status: "paid", amount_total: 2627, currency: "usd", payment_intent: "pi_1", payment_method_types: ["card"] });
  it("accepts a fresh, correctly signed event", () => {
    expect(verifyStripe(paid, stripeHeader(paid, now), STRIPE_SECRET, now)).toBe(true);
  });
  it("rejects tampering, the wrong secret and replays older than 5 minutes", () => {
    expect(verifyStripe(paid.replace("2627", "1"), stripeHeader(paid, now), STRIPE_SECRET, now)).toBe(false);
    expect(verifyStripe(paid, stripeHeader(paid, now, "whsec_other"), STRIPE_SECRET, now)).toBe(false);
    expect(verifyStripe(paid, stripeHeader(paid, now - 600), STRIPE_SECRET, now)).toBe(false);
    expect(verifyStripe(paid, `t=${now}`, STRIPE_SECRET, now)).toBe(false);
  });
  it("reads paid, still-clearing and failed checkouts", () => {
    expect(parseStripe(paid)).toMatchObject({ ref: "cs_test_1", status: "paid", paymentId: "pi_1", amountMinor: 2627, currency: "USD", method: "card" });
    // a bank debit that hasn't cleared isn't paid yet
    expect(parseStripe(stripeEvent("checkout.session.completed", { id: "cs_2", payment_status: "unpaid" })).status).toBe("ignore");
    expect(parseStripe(stripeEvent("checkout.session.async_payment_succeeded", { id: "cs_2", payment_status: "paid" })).status).toBe("paid");
    expect(parseStripe(stripeEvent("checkout.session.async_payment_failed", { id: "cs_2" })).status).toBe("failed");
  });
});

describe("amounts in the smallest unit", () => {
  it("uses paise, cents, or whole yen", () => {
    expect(toMinor(281, "INR")).toBe(28100);
    expect(toMinor(26.27, "USD")).toBe(2627);
    expect(toMinor(3000, "JPY")).toBe(3000);
    expect(fromMinor(2627, "USD")).toBe(26.27);
  });
});

describe("Stripe saved cards (pay automatically)", () => {
  it("reads automatic charges, and never treats saving a card as a payment", () => {
    const ok = stripeEvent("payment_intent.succeeded", { id: "pi_auto_1", object: "payment_intent", amount_received: 3018, currency: "usd", payment_method_types: ["card"] });
    expect(parseStripe(ok)).toMatchObject({ ref: "pi_auto_1", status: "paid", amountMinor: 3018, currency: "USD" });
    expect(parseStripe(stripeEvent("payment_intent.payment_failed", { id: "pi_auto_2" })).status).toBe("failed");
    const setup = parseStripe(stripeEvent("checkout.session.completed", { id: "cs_setup_1", mode: "setup", payment_status: "no_payment_required" }));
    expect(setup).toMatchObject({ status: "ignore", setup: true, ref: "cs_setup_1" });
  });
});

describe("automatic payments in webhooks", () => {
  const rzp = (event: string, payload: object) => parseRazorpay(JSON.stringify({ event, payload }), "evt");

  it("reads Razorpay plan renewals", () => {
    const charged = rzp("subscription.charged", {
      subscription: { entity: { id: "sub_1", notes: { toss_tenant: "t1" } } },
      payment: { entity: { id: "pay_9", amount: 49900, currency: "INR", method: "card", order_id: "order_x", invoice_id: "inv_x" } },
    });
    expect(charged).toMatchObject({ status: "ignore", renewal: { sub: "sub_1", tenant: "t1", state: "charged" }, paymentId: "pay_9", amountMinor: 49900, currency: "INR" });
    expect(rzp("subscription.halted", { subscription: { entity: { id: "sub_1", notes: [] } } }).renewal).toEqual({ sub: "sub_1", tenant: undefined, state: "failing" });
    expect(rzp("subscription.cancelled", { subscription: { entity: { id: "sub_1" } } }).renewal?.state).toBe("cancelled");
  });

  it("reads Razorpay recurring charges and finished card mandates", () => {
    expect(rzp("payment.captured", { payment: { entity: { id: "pay_1", amount: 28100, currency: "INR", order_id: "order_1" } } })).toMatchObject({ ref: "order_1", status: "paid", amountMinor: 28100 });
    expect(rzp("payment.failed", { payment: { entity: { id: "pay_2", order_id: "order_2" } } })).toMatchObject({ ref: "order_2", status: "failed" });
    // the subscription's own payments carry an invoice: handled as renewals, not here
    expect(rzp("payment.captured", { payment: { entity: { id: "pay_3", order_id: "order_3", invoice_id: "inv_3" } } }).status).toBe("ignore");
    expect(rzp("invoice.paid", { invoice: { entity: { id: "inv_7" } } })).toMatchObject({ setup: true, ref: "inv_7" });
  });

  it("reads Stripe plan renewals", () => {
    expect(parseStripe(stripeEvent("checkout.session.completed", { id: "cs_9", mode: "subscription", subscription: "sub_s", client_reference_id: "t1" })).renewal).toEqual({
      session: "cs_9",
      sub: "sub_s",
      tenant: "t1",
      state: "active",
    });
    expect(parseStripe(stripeEvent("invoice.paid", { id: "in_1", subscription: "sub_s", amount_paid: 1900, currency: "usd" }))).toMatchObject({ renewal: { sub: "sub_s", state: "charged" }, amountMinor: 1900, currency: "USD" });
    expect(parseStripe(stripeEvent("invoice.paid", { id: "in_0", subscription: "sub_s", amount_paid: 0, currency: "usd" })).renewal?.state).toBe("active");
    expect(parseStripe(stripeEvent("invoice.payment_failed", { id: "in_2", parent: { subscription_details: { subscription: "sub_s" } } })).renewal?.state).toBe("failing");
    expect(parseStripe(stripeEvent("customer.subscription.deleted", { id: "sub_s" })).renewal).toEqual({ sub: "sub_s", state: "cancelled" });
  });
});

describe("Dodo webhooks", () => {
  // a made-up secret in Dodo's format (whsec_ + base64 key); never a real one
  const key = Buffer.from("toss-test-signing-key-0123456789");
  const secret = `whsec_${key.toString("base64")}`;
  const sign = (id: string, ts: string, raw: string) => `v1,${createHmac("sha256", key).update(`${id}.${ts}.${raw}`).digest("base64")}`;
  const now = 1_800_000_000;

  it("accepts a correctly signed message and rejects tampered, old or unsigned ones", () => {
    const raw = JSON.stringify({ type: "payment.succeeded", data: { payment_id: "pay_1" } });
    const ts = String(now);
    const h = { id: "msg_1", timestamp: ts, signature: `v1,bad ${sign("msg_1", ts, raw)}` };
    expect(verifyDodo(raw, h, secret, now)).toBe(true);
    expect(verifyDodo(raw.replace("pay_1", "pay_2"), h, secret, now)).toBe(false);
    expect(verifyDodo(raw, h, secret, now + 301)).toBe(false);
    expect(verifyDodo(raw, { ...h, signature: null }, secret, now)).toBe(false);
  });

  it("reads one-time payments, before tax", () => {
    const e = parseDodo(JSON.stringify({ type: "payment.succeeded", data: { payment_id: "pay_9", total_amount: 5240, tax: 340, currency: "usd", checkout_session_id: "cks_1" } }), "msg_9");
    expect(e).toMatchObject({ eventId: "msg_9", ref: "cks_1", status: "paid", paymentId: "pay_9", amountMinor: 4900, currency: "USD" });
    expect(parseDodo(JSON.stringify({ type: "payment.failed", data: { checkout_session_id: "cks_2" } }), "m").status).toBe("failed");
  });

  it("reads plan renewals", () => {
    const charged = parseDodo(JSON.stringify({ type: "payment.succeeded", data: { payment_id: "pay_3", total_amount: 1900, tax: 0, currency: "USD", subscription_id: "sub_1", metadata: { toss_tenant: "t1" } } }), "m");
    expect(charged).toMatchObject({ status: "ignore", renewal: { sub: "sub_1", tenant: "t1", state: "charged" }, amountMinor: 1900 });
    expect(parseDodo(JSON.stringify({ type: "subscription.active", data: { subscription_id: "sub_1", metadata: { toss_tenant: "t1" } } }), "m").renewal).toEqual({ sub: "sub_1", tenant: "t1", state: "active" });
    expect(parseDodo(JSON.stringify({ type: "subscription.on_hold", data: { subscription_id: "sub_1" } }), "m").renewal?.state).toBe("failing");
    expect(parseDodo(JSON.stringify({ type: "subscription.cancelled", data: { subscription_id: "sub_1" } }), "m").renewal?.state).toBe("cancelled");
    expect(parseDodo(JSON.stringify({ type: "subscription.renewed", data: { subscription_id: "sub_1" } }), "m").renewal).toBeUndefined();
  });
});
