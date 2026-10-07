import { describe, expect, it } from "vitest";
import { monthKeyIST, monthLabel, monthRangeIST, statements } from "./accounts";
import type { Order } from "./types";

const order = (p: Partial<Order>): Order =>
  ({ id: "x", deviceId: "d", deviceOrderId: 1, address: "", weightKg: 5, status: "COMPLETED", paymentStatus: "UNPAID", amountDue: 200, createdAt: "2026-10-01T00:00:00Z", ...p }) as Order;

describe("account months (IST)", () => {
  it("puts a pickup just after midnight IST on the 1st into the new month", () => {
    expect(monthKeyIST("2026-09-30T18:45:00Z")).toBe("2026-10"); // 00:15 IST on 1 Oct
    expect(monthKeyIST("2026-09-30T18:15:00Z")).toBe("2026-09"); // 23:45 IST on 30 Sep
  });
  it("gives the IST month as a UTC range", () => {
    expect(monthRangeIST("2026-10")).toEqual({ start: "2026-09-30T18:30:00.000Z", end: "2026-10-31T18:30:00.000Z" });
    expect(monthRangeIST("2026-12")?.end).toBe("2026-12-31T18:30:00.000Z");
    expect(monthRangeIST("2026-13")).toBeNull();
    expect(monthRangeIST("Oct")).toBeNull();
  });
  it("labels months", () => {
    expect(monthLabel("2026-10")).toBe("October 2026");
  });
});

describe("statements", () => {
  it("groups completed pickups by month, newest first, and totals what's unpaid", () => {
    const s = statements([
      order({ id: "a", completedAt: "2026-09-10T05:00:00Z", amountDue: 100, weightKg: 2.5, paymentStatus: "PAID" }),
      order({ id: "b", completedAt: "2026-10-02T05:00:00Z", amountDue: 200, weightKg: 5 }),
      order({ id: "c", completedAt: "2026-10-01T05:00:00Z", amountDue: 160, weightKg: 4, paymentStatus: "PENDING" }),
      order({ id: "d", status: "CANCELLED", amountDue: 999 }),
      order({ id: "e", status: "PENDING", amountDue: 999 }),
    ]);
    expect(s.map((x) => x.month)).toEqual(["2026-10", "2026-09"]);
    expect(s[0]).toMatchObject({ pickups: 2, kg: 9, amount: 360, unpaid: 360 });
    expect(s[0].orders.map((o) => o.id)).toEqual(["c", "b"]);
    expect(s[1]).toMatchObject({ pickups: 1, amount: 100, unpaid: 0 });
  });
});
