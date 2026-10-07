// Profit per order, from what the laundry actually earned and what the order cost it. Pure, so it's tested and
// shared by the Profit page, driver pay and the Excel export.
//
//   earned  = what the customer paid (after any discount and basket credit)
//           + Toss's share of the basket credit, which Toss pays back off the subscription
//   costs   = supplies used (per kg and per order, at their unit cost)
//           + the laundry's other running cost per kg (water, power, labour)
//           + driver pay (per pickup, plus per km from the store to the basket)

export type SupplyCost = { perKg: number; perOrder: number; costPerUnit: number };
export type CostSettings = { otherCostPerKg: number; driverPayPerPickup: number; driverPayPerKm: number; tossSharePct: number };

/** What supplies cost per kg washed, and per order. */
export function supplyRates(supplies: SupplyCost[]) {
  return supplies.reduce(
    (a, s) => ({ perKg: a.perKg + s.perKg * s.costPerUnit, perOrder: a.perOrder + s.perOrder * s.costPerUnit }),
    { perKg: 0, perOrder: 0 },
  );
}

/** A driver's pay for one pickup. km: store to basket, if both are on the map. */
export const driverPay = (c: Pick<CostSettings, "driverPayPerPickup" | "driverPayPerKm">, km?: number) =>
  c.driverPayPerPickup + (km && km > 0 ? c.driverPayPerKm * km : 0);

export type OrderProfit = { paid: number; tossPayback: number; supplies: number; other: number; driver: number; profit: number; perKg: number | null };

export function orderProfit(
  o: { amountDue: number; weightKg: number; creditApplied?: number },
  rates: { perKg: number; perOrder: number },
  c: CostSettings,
  km?: number,
): OrderProfit {
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const kg = Math.max(0, o.weightKg || 0);
  const paid = Math.max(0, o.amountDue || 0);
  const tossPayback = ((o.creditApplied ?? 0) * c.tossSharePct) / 100;
  const supplies = rates.perKg * kg + rates.perOrder;
  const other = c.otherCostPerKg * kg;
  const driver = driverPay(c, km);
  const profit = paid + tossPayback - supplies - other - driver;
  return {
    paid: r2(paid),
    tossPayback: r2(tossPayback),
    supplies: r2(supplies),
    other: r2(other),
    driver: r2(driver),
    profit: r2(profit),
    perKg: kg > 0 ? r2(profit / kg) : null,
  };
}
