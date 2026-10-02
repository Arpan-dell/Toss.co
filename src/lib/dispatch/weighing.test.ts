import { describe, expect, it } from "vitest";
import { parseKg, repriceForWeight, weightGapPct } from "./weighing";

describe("parseKg", () => {
  it("reads what drivers type", () => {
    expect(parseKg("6.4")).toBe(6.4);
    expect(parseKg("6,4")).toBe(6.4);
    expect(parseKg("6.4 kg")).toBe(6.4);
    expect(parseKg(" 12KG ")).toBe(12);
    expect(parseKg("7.125")).toBe(7.13);
  });
  it("rejects non-numbers and impossible weights", () => {
    expect(parseKg("📋 My pickups")).toBeNull();
    expect(parseKg("six")).toBeNull();
    expect(parseKg("-3")).toBeNull();
    expect(parseKg("0.1")).toBe("range");
    expect(parseKg("75")).toBe("range");
  });
});

describe("repriceForWeight", () => {
  it("keeps the order's own rate", () => {
    // placed at 3 kg × ₹80 = ₹240; the price has since changed to ₹90
    expect(repriceForWeight({ weightKg: 3, amountDue: 240 }, 6.5, 90)).toEqual({ amountDue: 520, amountBeforeDiscount: null });
  });
  it("re-applies a win-back discount on the measured weight", () => {
    // 3 kg × ₹80 = ₹240 before, 10% off → ₹216; weighed 5 kg → ₹400 before, ₹360 due
    expect(repriceForWeight({ weightKg: 3, amountDue: 216, amountBeforeDiscount: 240, discountPct: 10 }, 5, 80)).toEqual({
      amountDue: 360,
      amountBeforeDiscount: 400,
    });
  });
  it("falls back to the current price when the order had no rate", () => {
    expect(repriceForWeight({ weightKg: 0, amountDue: 0 }, 4, 75)).toEqual({ amountDue: 300, amountBeforeDiscount: null });
  });
  it("catches an under-reporting basket", () => {
    // basket claimed 1 kg (₹80); the scale says 7 kg
    expect(repriceForWeight({ weightKg: 1, amountDue: 80 }, 7, 80).amountDue).toBe(560);
    expect(weightGapPct(1, 7)).toBe(600);
  });
});
