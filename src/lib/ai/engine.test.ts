import { describe, expect, it } from "vitest";
import { analyze, applyDecisions, type Candidate, type EngineInput } from "./engine";

const NOW = "2026-10-07T06:00:00Z"; // a Wednesday (IST)
const DAY = 86_400_000;
const ago = (d: number) => new Date(new Date(NOW).getTime() - d * DAY).toISOString();

// 8 weeks of history: busy Saturdays (6 orders), 1 order on other days. Customer "reg" orders weekly.
function history(): EngineInput["orders"] {
  const out: EngineInput["orders"] = [];
  for (let d = 1; d <= 56; d++) {
    const t = new Date(new Date(NOW).getTime() - d * DAY);
    const weekday = new Date(t.getTime() + 330 * 60_000).getUTCDay();
    const n = weekday === 6 ? 6 : 1;
    for (let i = 0; i < n; i++) {
      out.push({ placedAt: t.toISOString(), completedAt: new Date(t.getTime() + 3 * 3_600_000).toISOString(), weightKg: 4, amount: 400, status: "COMPLETED", paid: true, customerId: `walk-${d}-${i}` });
    }
  }
  return out;
}

const base = (over: Partial<EngineInput> = {}): EngineInput => ({
  now: NOW,
  tenant: { pricePerKg: 100, winbackPct: 10 },
  guardrails: { maxDiscount: 20, priceStepPct: 5 },
  orders: history(),
  customers: [],
  unpaid: [],
  baskets: [],
  drivers: [{ id: "d1", name: "Vikram", connected: true, maxJobs: 3 }],
  recent: [],
  ...over,
});

describe("forecast and KPIs", () => {
  it("expects Saturdays to be the busy day", () => {
    const a = analyze(base());
    const sat = a.forecast.find((d) => d.weekday === "Sat")!;
    const mon = a.forecast.find((d) => d.weekday === "Mon")!;
    expect(sat.expectedOrders).toBeCloseTo(6, 0);
    expect(mon.expectedOrders).toBeCloseTo(1, 0);
    expect(a.forecast).toHaveLength(7);
    expect(a.forecast[0].date).toBe("2026-10-08");
  });

  it("computes KPIs and a 0-100 health score", () => {
    const a = analyze(base());
    expect(a.kpis.orders30).toBeGreaterThan(40);
    expect(a.kpis.collectionPct).toBe(100);
    expect(a.kpis.avgPickupHrs).toBe(3);
    expect(a.health.score).toBeGreaterThanOrEqual(0);
    expect(a.health.score).toBeLessThanOrEqual(100);
  });
});

describe("candidate actions", () => {
  it("alerts drivers before a busy day that's coming up", () => {
    const fri = new Date("2026-10-09T06:00:00Z").toISOString(); // Saturday is tomorrow
    const a = analyze(base({ now: fri }));
    const alert = a.candidates.find((c) => c.type === "driver_alert");
    expect(alert?.target).toBe("2026-10-10");
    expect(alert?.params.weekday).toBe("Sat");
  });

  it("respects cool-downs", () => {
    const fri = new Date("2026-10-09T06:00:00Z").toISOString();
    const a = analyze(base({ now: fri, recent: ["driver_alert:2026-10-10"] }));
    expect(a.candidates.find((c) => c.type === "driver_alert" && c.target === "2026-10-10")).toBeUndefined();
  });

  it("wins back a regular who's late against their own rhythm, capped by the guardrail", () => {
    const reg = [5, 12, 19, 26, 33, 40].map((d) => d + 20); // weekly, last order 25 days ago
    const orders = [...history(), ...reg.map((d) => ({ placedAt: ago(d), weightKg: 5, amount: 500, status: "COMPLETED", paid: true, customerId: "reg" }))];
    const a = analyze(base({ orders, customers: [{ id: "reg", code: "C-REG001", reachable: true, openOffer: false }], guardrails: { maxDiscount: 12, priceStepPct: 5 } }));
    const offer = a.candidates.find((c) => c.type === "winback_offer");
    expect(offer?.target).toBe("reg");
    expect(offer?.params.pct).toBe(12); // 10% + 5 loyalty, capped at 12
    expect(offer?.params.usualGapDays).toBe(7);
  });

  it("doesn't chase customers who can't be reached or already have an offer", () => {
    const orders = [...history(), ...[30, 37, 44].map((d) => ({ placedAt: ago(d), weightKg: 5, amount: 500, status: "COMPLETED", paid: true, customerId: "x" }))];
    for (const c of [{ id: "x", code: "C-X", reachable: false, openOffer: false }, { id: "x", code: "C-X", reachable: true, openOffer: true }]) {
      expect(analyze(base({ orders, customers: [c] })).candidates.some((k) => k.type === "winback_offer")).toBe(false);
    }
  });

  it("reminds about invoices unpaid for 2+ days and nudges nearly-full baskets", () => {
    const a = analyze(
      base({
        unpaid: [
          { orderId: "o1", label: "#1", customerCode: "C-1", amount: 300, completedAt: ago(9), reachable: true },
          { orderId: "o2", label: "#2", customerCode: "C-2", amount: 200, completedAt: ago(1), reachable: true },
        ],
        baskets: [
          { deviceId: "b1", customerCode: "C-1", fillPct: 85, reachable: true },
          { deviceId: "b2", customerCode: "C-2", fillPct: 40, reachable: true },
        ],
      }),
    );
    const reminders = a.candidates.filter((c) => c.type === "payment_reminder");
    expect(reminders.map((c) => c.target)).toEqual(["o1"]);
    expect(reminders[0].priority).toBe(1);
    expect(a.candidates.filter((c) => c.type === "basket_nudge").map((c) => c.target)).toEqual(["b1"]);
    expect(a.kpis.outstanding).toBe(500);
  });

  it("suggests a price rise only with strong growth and a driver shortage, within limits", () => {
    const boom = [...history(), ...Array.from({ length: 300 }, (_, i) => ({ placedAt: ago((i % 28) + 0.5), weightKg: 4, amount: 400, status: "COMPLETED", paid: true }))];
    const a = analyze(base({ orders: boom, guardrails: { maxDiscount: 20, priceStepPct: 5, priceMax: 103 } }));
    const p = a.candidates.find((c) => c.type === "price_change");
    expect(p?.params).toMatchObject({ from: 100, to: 103 });
    expect(analyze(base()).candidates.some((c) => c.type === "price_change")).toBe(false);
  });
});

describe("applying the AI's decisions", () => {
  const input = base();
  const cands: Candidate[] = [
    { id: "c1", type: "winback_offer", target: "u", label: "", params: { customerCode: "C-1", pct: 10 }, reason: "r", impact: "i", priority: 2 },
    { id: "c2", type: "price_change", target: "business", label: "", params: { from: 100, to: 105 }, reason: "r", impact: "i", priority: 2 },
    { id: "c3", type: "payment_reminder", target: "o", label: "", params: {}, reason: "r", impact: "i", priority: 2 },
  ];

  it("clamps discounts and prices to the guardrails and ignores invented actions", () => {
    const out = applyDecisions(
      cands,
      [
        { candidateId: "c1", approve: true, discountPct: 90, message: "<b>Come back!</b>   we miss you" },
        { candidateId: "c2", approve: true, newPrice: 500 },
        { candidateId: "c99", approve: true },
      ],
      input,
    );
    expect(out.find((c) => c.id === "c1")?.params).toMatchObject({ pct: 20, message: "bCome back!/b we miss you" });
    expect(out.find((c) => c.id === "c2")?.params.to).toBe(105); // max one 5% step
    expect(out).toHaveLength(3);
  });

  it("never lets a customer code into a customer-facing message", () => {
    const out = applyDecisions(cands, [{ candidateId: "c3", approve: true, message: "Hi C-KH7QVB, please clear ₹271 for order #114." }], input);
    expect(out.find((c) => c.id === "c3")?.params.message).toBe("Hi please clear ₹271 for order #114.");
  });

  it("drops what the AI rejects and keeps everything when it says nothing", () => {
    expect(applyDecisions(cands, [{ candidateId: "c3", approve: false }], input).map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(applyDecisions(cands, undefined, input)).toHaveLength(3);
  });
});
