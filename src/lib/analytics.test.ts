import { describe, expect, it } from "vitest";
import { computeAggregates } from "./analytics";
import type { Order } from "./types";

const order = (createdAt: string, weightKg = 5): Order => ({
  id: createdAt,
  deviceOrderId: 1,
  deviceId: "d",
  tenantId: "t",
  address: "",
  weightKg,
  status: "COMPLETED",
  paymentStatus: "PAID",
  amountDue: 400,
  createdAt,
});

describe("computeAggregates", () => {
  it("buckets by India time, not the server's UTC clock", () => {
    // 2026-09-26 20:00 UTC is Sunday 01:30 in Delhi.
    const agg = computeAggregates([order("2026-09-26T20:00:00.000Z")]);
    expect(agg.byWeekday.find((d) => d.orders)?.day).toBe("Sun");
  });

  it("starts weeks on Monday in India time", () => {
    // Monday 2026-09-28 00:30 IST = 2026-09-27 19:00 UTC.
    const agg = computeAggregates([order("2026-09-27T19:00:00.000Z")]);
    expect(agg.byWeek).toEqual([{ weekStart: "2026-09-28", orders: 1, kg: 5 }]);
  });

  it("handles no orders", () => {
    const agg = computeAggregates([]);
    expect(agg).toMatchObject({ totalOrders: 0, totalKg: 0, byWeek: [], avgTurnaroundHrs: 0 });
  });
});
