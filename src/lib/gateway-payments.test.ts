import { beforeEach, describe, expect, it, vi } from "vitest";

// A tiny in-memory stand-in for the service-role Supabase client: just the calls settle() makes.
type Row = Record<string, unknown>;
const tables = new Map<string, Row[]>();
function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let patch: Row | null = null;
  const rows = () => (tables.get(table) ?? []).filter((r) => filters.every((f) => f(r)));
  const run = () => {
    const hit = rows();
    if (patch) hit.forEach((r) => Object.assign(r, patch));
    return { data: hit, error: null };
  };
  const b = {
    select: () => b,
    update: (p: Row) => ((patch = p), b),
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
    neq: (k: string, v: unknown) => (filters.push((r) => r[k] !== v), b),
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    single: async () => ({ data: run().data[0] ?? null, error: null }),
    then: (ok: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve(run()).then(ok),
  };
  return b;
}
vi.mock("./supabase/admin", () => ({ supabaseAdmin: () => ({ from: query, rpc: async () => ({ error: null }) }) }));
const sendInvoice = vi.fn(async () => null);
vi.mock("./invoice/service", () => ({ sendInvoice: () => sendInvoice() }));
vi.mock("./email/notify", () => ({ notifySubscriptionReviewed: async () => {} }));
vi.mock("./log", () => ({ logError: () => {} }));
vi.mock("./secret-box", () => ({ open: (s: string) => s, seal: (s: string) => s }));

const { settle } = await import("./gateway-payments");

const intent = (o: Partial<Row> = {}) =>
  ({
    id: "11111111-1111-1111-1111-111111111111",
    kind: "order",
    tenant_id: "t1",
    order_id: "o1",
    customer_id: "c1",
    months: null,
    discount_pct: 0,
    credit_used: 0,
    provider: "razorpay",
    platform: false,
    provider_ref: "plink_1",
    checkout_url: null,
    amount_minor: 28100,
    currency: "INR",
    tip: 0,
    status: "created",
    created_at: "2026-10-15T10:00:00Z",
    ...o,
  }) as Parameters<typeof settle>[0];
const paid = { eventId: "e1", type: "payment_link.paid", ref: "plink_1", status: "paid" as const, paymentId: "pay_1", amountMinor: 28100, currency: "INR", method: "upi" };

beforeEach(() => {
  sendInvoice.mockClear();
  tables.set("payment_intents", [intent() as unknown as Row]);
  tables.set("orders", [{ id: "o1", amount_due: 281, payment_status: "UNPAID" }]);
});
const order = () => tables.get("orders")![0];
const stored = () => tables.get("payment_intents")![0];

describe("settling a gateway payment", () => {
  it("marks the bill paid and sends the invoice when the gateway confirms the exact amount", async () => {
    expect(await settle(intent(), paid)).toBe("paid");
    expect(order()).toMatchObject({ payment_status: "PAID", payment_method: "RAZORPAY", payment_ref: "pay_1" });
    expect(stored()).toMatchObject({ status: "paid", provider_payment_id: "pay_1", method: "upi" });
    expect(sendInvoice).toHaveBeenCalledTimes(1);
  });

  it("ignores a confirmation for a different amount or currency", async () => {
    expect(await settle(intent(), { ...paid, amountMinor: 100 })).toBe("mismatch");
    expect(order().payment_status).toBe("UNPAID");
    tables.set("payment_intents", [intent() as unknown as Row]);
    expect(await settle(intent(), { ...paid, currency: "USD" })).toBe("mismatch");
    expect(order().payment_status).toBe("UNPAID");
  });

  it("acts once, however many times the gateway (or the status check) confirms it", async () => {
    await settle(intent(), paid);
    await settle(intent(), paid);
    expect(sendInvoice).toHaveBeenCalledTimes(1);
  });

  it("leaves a bill that went up after the page was made for the laundry to check", async () => {
    order().amount_due = 300; // re-weighed after the customer opened the payment page
    await settle(intent(), paid);
    expect(order().payment_status).toBe("PENDING");
    expect(sendInvoice).not.toHaveBeenCalled();
  });

  it("doesn't touch a bill that was already paid another way", async () => {
    order().payment_status = "PAID";
    order().payment_method = "CASH";
    await settle(intent(), paid);
    expect(order().payment_method).toBe("CASH");
    expect(sendInvoice).not.toHaveBeenCalled();
  });

  it("records failed and expired pages without touching the bill", async () => {
    expect(await settle(intent(), { ...paid, status: "expired" })).toBe("expired");
    expect(order().payment_status).toBe("UNPAID");
  });
});
