import { describe, expect, it } from "vitest";
import { attentionItems, type AttentionInput } from "./attention";
import type { Driver, Order } from "./types";

const now = new Date("2026-10-08T12:00:00Z");
const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();
let n = 100;
const order = (p: Partial<Order>): Order =>
  ({ id: `d#${++n}`, deviceId: "d", deviceOrderId: n, address: "", weightKg: 5, status: "COMPLETED", paymentStatus: "PAID", amountDue: 250, createdAt: ago(60), ...p }) as Order;
const driver = (p: Partial<Driver> = {}): Driver =>
  ({ id: "x", tenantId: "t", name: "Vikram", telegramChatId: "1", status: "AVAILABLE", maxJobs: 3, payType: "TRIP", monthlySalary: 0, ...p }) as Driver;

const base = (p: Partial<AttentionInput> = {}): AttentionInput => ({
  now,
  orders: [],
  devices: [],
  drivers: [driver()],
  business: { upiId: "fresh@sbi", storeAddress: "Lajpat Nagar", storeLocated: true, delivers: true },
  plan: { state: "ACTIVE" },
  ...p,
});
const keys = (i: AttentionInput) => attentionItems(i).map((a) => a.key);

describe("needs attention", () => {
  it("is empty when everything is fine", () => {
    expect(attentionItems(base())).toEqual([]);
  });

  it("flags setup gaps: no UPI, no drivers, store not on the map", () => {
    expect(keys(base({ business: { storeLocated: false, storeAddress: "x", delivers: true }, drivers: [] }))).toEqual(["upi", "no-drivers", "store"]);
  });

  it("flags a pickup nobody took for 15 minutes, linking straight to it", () => {
    const o = order({ status: "PENDING", createdAt: ago(20) });
    const [a] = attentionItems(base({ orders: [o, order({ status: "PENDING", createdAt: ago(5) })] }));
    expect(a.key).toBe("stuck");
    expect(a.title).toBe("1 pickup waiting over 15 minutes for a driver");
    expect(a.href).toBe(`/admin/orders/${encodeURIComponent(o.id)}`);
  });

  it("says when work waits but every driver is offline", () => {
    expect(keys(base({ drivers: [driver({ status: "OFFLINE" })], orders: [order({ status: "PENDING", createdAt: ago(1) })] }))).toEqual(["offline"]);
  });

  it("puts critical items first: late orders before money", () => {
    const k = keys(
      base({
        orders: [
          order({ paymentStatus: "PENDING" }),
          order({ readyBy: ago(60) }),
          order({ paymentStatus: "UNPAID", completedAt: ago(8 * 24 * 60), customerId: "c1" }),
        ],
      }),
    );
    expect(k).toEqual(["late", "confirm", "overdue"]);
  });

  it("doesn't chase monthly-account bills as overdue", () => {
    expect(keys(base({ orders: [order({ paymentStatus: "UNPAID", completedAt: ago(10 * 24 * 60), accountId: "A-1" })] }))).toEqual([]);
  });

  it("follows deliveries: customer not home, and ready orders waiting for a driver", () => {
    const k = keys(
      base({
        orders: [
          order({ readyAt: ago(10), deliveryStatus: "WAITING", deliveryAttempts: 1 }),
          order({ readyAt: ago(45), deliveryStatus: "WAITING" }),
          order({ readyAt: ago(5), deliveryStatus: "WAITING" }),
        ],
      }),
    );
    expect(k).toEqual(["missed", "delivery-wait"]);
  });

  it("warns about low stock, quiet baskets and a trial about to end", () => {
    const k = keys(
      base({
        lowStock: [{ name: "Bleach" }],
        devices: [{ deviceId: "d1", lastSeenAt: ago(2 * 24 * 60) }, { deviceId: "d2", lastSeenAt: ago(5) }],
        plan: { state: "TRIAL", daysLeft: 2 },
      }),
    );
    expect(k).toEqual(["stock", "baskets", "trial"]);
  });
});
