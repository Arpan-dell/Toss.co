import { describe, expect, it } from "vitest";
import { computeInsights, type InsightOrder, type InsightsInput } from "./insights";

const NOW = "2026-10-07T06:30:00Z"; // Wed 12:00 IST
const DAY = 86_400_000;
const at = (daysAgo: number, istHour = 10) => {
  const d = new Date(new Date(NOW).getTime() - daysAgo * DAY);
  const day = new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  return new Date(`${day}T${String(istHour).padStart(2, "0")}:00:00+05:30`).toISOString();
};
let seq = 0;
const order = (daysAgo: number, o: Partial<InsightOrder> = {}): InsightOrder => ({
  id: `o${seq++}`,
  placedAt: at(daysAgo, o.placedAt ? 10 : 10),
  completedAt: at(daysAgo, 12),
  weightKg: 4,
  amount: 400,
  status: "COMPLETED",
  paymentStatus: "PAID",
  paymentConfirmedAt: at(daysAgo - 1, 12),
  deviceId: "b1",
  declinedBy: [],
  ...o,
});

// 12 weeks: Saturdays 8 orders at 10:00, other days 2.
function steady(): InsightOrder[] {
  const out: InsightOrder[] = [];
  for (let d = 1; d <= 84; d++) {
    const wd = new Date(new Date(at(d)).getTime() + 330 * 60_000).getUTCDay();
    for (let k = 0; k < (wd === 6 ? 8 : 2); k++) out.push(order(d, { customerId: `walk-${d}-${k}` }));
  }
  return out;
}

const base = (orders: InsightOrder[], extra: Partial<InsightsInput> = {}): InsightsInput => ({
  now: NOW,
  orders,
  customers: [],
  devices: [{ deviceId: "b1", area: "Saket" }, { deviceId: "b2", area: "Dwarka" }],
  drivers: [],
  ...extra,
});

describe("forecast", () => {
  it("learns the weekly pattern and measures its own accuracy on a holdout", () => {
    const i = computeInsights(base(steady()));
    const sat = i.forecast.next.find((d) => d.weekday === "Sat")!;
    const mon = i.forecast.next.find((d) => d.weekday === "Mon")!;
    expect(sat.mid).toBeGreaterThan(6);
    expect(mon.mid).toBeLessThan(3);
    expect(sat.lo).toBeLessThanOrEqual(sat.mid);
    expect(sat.hi).toBeGreaterThanOrEqual(sat.mid);
    expect(i.forecast.accuracyPct).toBeGreaterThanOrEqual(90); // a perfectly regular pattern is easy
    expect(i.forecast.coverage?.of).toBe(14);
    expect(i.forecast.history).toHaveLength(28);
    expect(i.forecast.next30.revenue).toBeGreaterThan(0);
    expect(i.forecast.next30.revenueLo).toBeLessThanOrEqual(i.forecast.next30.revenue);
    expect(i.data.level).toBe("high");
  });

  it("is honest when there's too little data", () => {
    const i = computeInsights(base([order(2), order(3)]));
    expect(i.data.level).toBe("low");
    expect(i.forecast.accuracyPct).toBeNull();
  });
});

describe("heatmap and anomalies", () => {
  it("finds the busiest 3-hour window", () => {
    const i = computeInsights(base(steady()));
    expect(i.heatmap.peak).toMatchObject({ weekday: "Sat", from: 8, to: 11 });
    expect(i.heatmap.cells[6][10]).toBeGreaterThan(0);
  });

  it("flags a day far outside its weekday's normal range", () => {
    const spike = Array.from({ length: 15 }, (_, k) => order(5, { customerId: `x${k}` })); // 5 days ago: +15 orders
    const i = computeInsights(base([...steady(), ...spike]));
    expect(i.anomalies).toHaveLength(1);
    expect(i.anomalies[0]).toMatchObject({ direction: "spike" });
    expect(computeInsights(base(steady())).anomalies).toHaveLength(0);
  });
});

describe("customers", () => {
  it("segments customers by their own rhythm and scores churn risk", () => {
    const champ = [3, 10, 17, 24, 31].map((d) => order(d, { customerId: "champ" }));
    const lapsing = [26, 33, 40, 47].map((d) => order(d, { customerId: "lapse" })); // weekly, now 26 days quiet
    const fresh = [order(4, { customerId: "new" })];
    const i = computeInsights(
      base([...champ, ...lapsing, ...fresh], { customers: [{ id: "champ", code: "C-CHAMP" }, { id: "lapse", code: "C-LAPSE" }, { id: "new", code: "C-NEW" }] }),
    );
    const by = Object.fromEntries(i.customers.list.map((c) => [c.code, c]));
    expect(by["C-CHAMP"].segment).toBe("Champions");
    expect(by["C-LAPSE"].segment).toBe("Lost"); // 26 days vs a 7-day rhythm
    expect(by["C-NEW"].segment).toBe("New");
    expect(by["C-LAPSE"].risk).toBeGreaterThan(90);
    expect(by["C-CHAMP"].risk).toBeLessThan(30);
    expect(by["C-CHAMP"].value12m).toBeGreaterThan(by["C-NEW"].value12m - 1);
  });

  it("counts revenue at risk from the at-risk segment", () => {
    const atRisk = [13, 20, 27].map((d) => order(d, { customerId: "r" })); // weekly, 13 days quiet ≈ 1.9x late
    const i = computeInsights(base(atRisk, { customers: [{ id: "r", code: "C-R" }] }));
    expect(i.customers.segments["At risk"]).toBe(1);
    expect(i.customers.revenueAtRisk).toBeGreaterThan(10000); // ₹400 × ~52 orders a year
  });
});

describe("money, areas and drivers", () => {
  it("ages unpaid invoices and estimates what comes in next week", () => {
    const unpaid = [order(3, { paymentStatus: "UNPAID", amount: 300 }), order(20, { paymentStatus: "UNPAID", amount: 500 }), order(40, { paymentStatus: "PENDING", amount: 200 })];
    const i = computeInsights(base([...steady(), ...unpaid]));
    expect(i.money.aging.map((a) => a.count)).toEqual([1, 0, 1, 1]);
    expect(i.money.outstanding).toBe(1000);
    expect(i.money.medianDaysToPay).toBe(1);
    expect(i.money.expectedIn7Days).toBeGreaterThan(0);
    expect(i.money.weeklyRevenue).toHaveLength(8);
  });

  it("ranks areas and drivers", () => {
    const dwarka = Array.from({ length: 4 }, (_, k) => order(k + 2, { deviceId: "b2", driverId: "d1", assignedAt: at(k + 2, 11) }));
    const i = computeInsights(base([...steady(), ...dwarka, order(3, { deviceId: "b2", declinedBy: ["d1"] })], { drivers: [{ chatId: "d1", name: "Vikram" }, { name: "Not connected" }] }));
    expect(i.areas[0].area).toBe("Saket");
    expect(i.areas.find((a) => a.area === "Dwarka")?.orders).toBe(5);
    expect(i.drivers).toEqual([{ name: "Vikram", pickups: 4, medianMins: 60, onTimePct: 100, declines: 1 }]);
  });
});
