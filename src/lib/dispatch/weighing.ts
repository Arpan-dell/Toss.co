import { KG_PER_LB, roundMoney } from "../regions";
// Pure helpers for the driver's weigh-in at pickup (no I/O, unit-tested).

export const MIN_KG = 0.2;
export const MAX_KG = 60;

/**
 * What the driver typed → kilograms. Accepts "6.4", "6,4", "6.4 kg", "6.4kg". Returns null if it isn't a
 * number, and "range" if it's a number outside what a laundry bag can weigh.
 */
export function parseKg(text: string): number | null | "range" {
  return parseWeight(text, "kg");
}

/**
 * Same, for a business that weighs in kg or lb: a bare number is in the business's unit, and "6.4 kg" or
 * "14 lb" always means what it says. Returns kilograms (how weights are stored).
 */
export function parseWeight(text: string, unit: "kg" | "lb"): number | null | "range" {
  const m = text.trim().toLowerCase().match(/^(\d{1,3}(?:[.,]\d{1,3})?)\s*(kg|kgs|kilo|kilos|lb|lbs|pound|pounds)?$/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  const inLb = m[2] ? m[2].startsWith("lb") || m[2].startsWith("pound") : unit === "lb";
  const kg = inLb ? n * KG_PER_LB : n;
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
  billing: { currency?: string; minOrder?: number } = {},
): { amountDue: number; amountBeforeDiscount: number | null } {
  const currency = billing.currency ?? "INR";
  const min = billing.minOrder ?? 0;
  const base = o.amountBeforeDiscount ?? o.amountDue;
  // a bill that was raised to the minimum order says nothing about the rate, so use the current price then
  const atMinimum = min > 0 && base <= min + 0.005;
  const rate = o.weightKg > 0 && base > 0 && !atMinimum ? base / o.weightKg : currentPricePerKg;
  const raw = kg * rate;
  const before = roundMoney(Math.max(raw, raw > 0 ? min : 0), currency);
  const pct = o.discountPct ?? 0;
  if (pct > 0) return { amountDue: roundMoney((before * (100 - pct)) / 100, currency), amountBeforeDiscount: before };
  return { amountDue: before, amountBeforeDiscount: o.amountBeforeDiscount == null ? null : before };
}

/** Percent difference between the basket's reading and the scale (positive: the bag was heavier). */
export const weightGapPct = (reportedKg: number, weighedKg: number) =>
  reportedKg > 0 ? Math.round(((weighedKg - reportedKg) / reportedKg) * 100) : null;

/** Where a laundry weighs: at the door (driver), at the store, or the basket's reading (before 0043: on/off). */
export function weighPlace(t: { weigh_at?: unknown; weigh_at_pickup?: unknown } | null | undefined): "door" | "store" | "basket" {
  if (t?.weigh_at === "store" || t?.weigh_at === "basket" || t?.weigh_at === "door") return t.weigh_at;
  return t?.weigh_at_pickup === false ? "basket" : "door";
}
