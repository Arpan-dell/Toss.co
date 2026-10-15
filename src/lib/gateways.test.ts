import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fromMinor, parseRazorpay, parseStripe, toMinor, verifyRazorpay, verifyStripe } from "./gateways";

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
