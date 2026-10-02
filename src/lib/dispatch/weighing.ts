// Pure helpers for the driver's weigh-in at pickup (no I/O, unit-tested).

export const MIN_KG = 0.2;
export const MAX_KG = 60;

/**
 * What the driver typed → kilograms. Accepts "6.4", "6,4", "6.4 kg", "6.4kg". Returns null if it isn't a
 * number, and "range" if it's a number outside what a laundry bag can weigh.
 */
export function parseKg(text: string): number | null | "range" {
  const m = text.trim().toLowerCase().match(/^(\d{1,3}(?:[.,]\d{1,3})?)\s*(?:kg|kgs|kilo|kilos)?$/);
  if (!m) return null;
  const kg = Number(m[1].replace(",", "."));
  if (!Number.isFinite(kg) || kg < MIN_KG || kg > MAX_KG) return "range";
  return Math.round(kg * 100) / 100;
}

/**
 * New amounts when the measured weight replaces the basket's reading. The order keeps the rate it was created
 * at (its amount before any discount ÷ its weight, so a later price change doesn't apply retroactively), and a
 * win-back discount is re-applied on top. Falls back to the business's current price if the order had no
 * usable rate (zero weight or amount).
 */
export function repriceForWeight(
  o: { weightKg: number; amountDue: number; amountBeforeDiscount?: number | null; discountPct?: number | null },
  kg: number,
  currentPricePerKg: number,
): { amountDue: number; amountBeforeDiscount: number | null } {
  const base = o.amountBeforeDiscount ?? o.amountDue;
  const rate = o.weightKg > 0 && base > 0 ? base / o.weightKg : currentPricePerKg;
  const before = Math.round(kg * rate);
  const pct = o.discountPct ?? 0;
  if (pct > 0) return { amountDue: Math.round((before * (100 - pct)) / 100), amountBeforeDiscount: before };
  return { amountDue: before, amountBeforeDiscount: o.amountBeforeDiscount == null ? null : before };
}

/** Percent difference between the basket's reading and the scale (positive: the bag was heavier). */
export const weightGapPct = (reportedKg: number, weighedKg: number) =>
  reportedKg > 0 ? Math.round(((weighedKg - reportedKg) / reportedKg) * 100) : null;
