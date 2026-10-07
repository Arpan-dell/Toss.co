// Profit per order, from what the laundry actually earned and what the order cost it. Pure, so it's tested and
// shared by the Profit page, driver pay and the Excel export.
//
//   earned  = what the customer paid (after any discount and basket credit)
//           + Toss's share of the basket credit, which Toss pays back off the subscription
//   costs   = supplies used (per kg and per order, at their unit cost)
//           + the laundry's other running cost per kg (water, power, labour)
//           + driver pay (per pickup, plus per km from the store to the basket)

export type SupplyCost = { perKg: number; perOrder: number; costPerUnit: number; appliesTo?: "ALL" | "WHITES" | "COLOURED" };
type Rate = { perKg: number; perOrder: number };
// every wash, plus supplies used only on whites or only on coloured clothes (sorted pickups, migration 0025)
export type SupplyRates = Rate & { whites?: Rate; coloured?: Rate };
export type CostSettings = { otherCostPerKg: number; driverPayPerPickup: number; driverPayPerKm: number; tossSharePct: number };

/** What supplies cost per kg washed, and per order: for every wash, and for whites-only / coloured-only ones. */
export function supplyRates(supplies: SupplyCost[]): Required<SupplyRates> {
  const add = (a: Rate, s: SupplyCost) => ({ perKg: a.perKg + s.perKg * s.costPerUnit, perOrder: a.perOrder + s.perOrder * s.costPerUnit });
  const r = { perKg: 0, perOrder: 0, whites: { perKg: 0, perOrder: 0 }, coloured: { perKg: 0, perOrder: 0 } };
  for (const s of supplies) {
    if (s.appliesTo === "WHITES") r.whites = add(r.whites, s);
    else if (s.appliesTo === "COLOURED") r.coloured = add(r.coloured, s);
    else Object.assign(r, add(r, s));
  }
  return r;
}

/** A driver's pay for one pickup. km: store to basket, if both are on the map. */
export const driverPay = (c: Pick<CostSettings, "driverPayPerPickup" | "driverPayPerKm">, km?: number) =>
  c.driverPayPerPickup + (km && km > 0 ? c.driverPayPerKm * km : 0);

export type OrderProfit = { paid: number; tossPayback: number; supplies: number; other: number; driver: number; profit: number; perKg: number | null };

export function orderProfit(
  o: { amountDue: number; weightKg: number; creditApplied?: number; whitesKg?: number; colouredKg?: number },
  rates: SupplyRates,
  c: CostSettings,
  km?: number,
  // a salaried driver: their salary spread over their trips, instead of the per-trip rate
  driverCost?: number,
): OrderProfit {
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const kg = Math.max(0, o.weightKg || 0);
  const paid = Math.max(0, o.amountDue || 0);
  const tossPayback = ((o.creditApplied ?? 0) * c.tossSharePct) / 100;
  // whites-only / coloured-only supplies count only when the order's bags were sorted
  const whites = Math.max(0, o.whitesKg ?? 0);
  const coloured = Math.max(0, o.colouredKg ?? 0);
  const typed = (r: Rate | undefined, k: number) => (r && k > 0 ? r.perKg * k + r.perOrder : 0);
  const supplies = rates.perKg * kg + rates.perOrder + typed(rates.whites, whites) + typed(rates.coloured, coloured);
  const other = c.otherCostPerKg * kg;
  const driver = driverCost ?? driverPay(c, km);
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
