import { describe, expect, it } from "vitest";
import { driverPay, orderProfit, supplyRates } from "./profit";

const costs = { otherCostPerKg: 6, driverPayPerPickup: 20, driverPayPerKm: 3, tossSharePct: 50 };

describe("supplyRates", () => {
  it("adds up what supplies cost per kg and per order", () => {
    // detergent 12 ml/kg at ₹0.25/ml, softener 4 ml/kg at ₹0.5/ml, one bag per order at ₹2
    expect(
      supplyRates([
        { perKg: 12, perOrder: 0, costPerUnit: 0.25 },
        { perKg: 4, perOrder: 0, costPerUnit: 0.5 },
        { perKg: 0, perOrder: 1, costPerUnit: 2 },
      ]),
    ).toEqual({ perKg: 5, perOrder: 2 });
  });
});

describe("driverPay", () => {
  it("is per pickup plus per km when the distance is known", () => {
    expect(driverPay(costs, 4)).toBe(32);
    expect(driverPay(costs)).toBe(20);
    expect(driverPay(costs, 0)).toBe(20);
  });
});

describe("orderProfit", () => {
  it("counts what the customer paid plus Toss's credit payback, minus every cost", () => {
    // 6 kg at ₹50 = ₹300, ₹48 basket credit -> customer pays ₹252, Toss pays back ₹24
    const p = orderProfit({ amountDue: 252, weightKg: 6, creditApplied: 48 }, { perKg: 5, perOrder: 2 }, costs, 4);
    expect(p).toEqual({ paid: 252, tossPayback: 24, supplies: 32, other: 36, driver: 32, profit: 176, perKg: 29.33 });
  });

  it("can go negative, and has no per-kg figure without a weight", () => {
    const p = orderProfit({ amountDue: 20, weightKg: 0 }, { perKg: 5, perOrder: 2 }, costs);
    expect(p.profit).toBe(-2);
    expect(p.perKg).toBeNull();
  });
});
