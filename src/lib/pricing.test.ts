import { describe, expect, it } from "vitest";
import { subscriptionDiscount, subscriptionQuote } from "./pricing";

const D = { discount3m: 10, discount6m: 15, discount12m: 25 };

describe("subscription pricing", () => {
  it.each([
    [1, 0],
    [2, 0],
    [3, 10],
    [5, 10],
    [6, 15],
    [11, 15],
    [12, 25],
  ])("%i months → %i%% off", (months, pct) => {
    expect(subscriptionDiscount(D, months)).toBe(pct);
  });

  it("quotes the discounted total", () => {
    expect(subscriptionQuote(499, D, 1)).toEqual({ pct: 0, full: 499, amount: 499, saved: 0 });
    expect(subscriptionQuote(499, D, 3)).toEqual({ pct: 10, full: 1497, amount: 1347, saved: 150 });
    expect(subscriptionQuote(499, D, 12)).toEqual({ pct: 25, full: 5988, amount: 4491, saved: 1497 });
  });

  it("charges nothing extra when discounts are off", () => {
    expect(subscriptionQuote(499, { discount3m: 0, discount6m: 0, discount12m: 0 }, 6).amount).toBe(2994);
  });
});
