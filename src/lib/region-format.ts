import { countryOf, hasCents, KG_PER_LB, type WeightUnit } from "./regions";

// Money, weight and dates the way a business's customers expect them: "₹1,250" and "5.2 kg" in Delhi, "$26.27" and
// "11.5 lb" in New York, "26,27 €" in Berlin, with times in the business's own time zone. Weights are always
// stored in kg and prices per kg; this only changes how they're shown (and how typed lb are read back).

export interface Region {
  country: string;
  currency: string;
  timezone: string;
  unit: WeightUnit;
}

export const INDIA_REGION: Region = { country: "IN", currency: "INR", timezone: "Asia/Kolkata", unit: "kg" };

/** The region of a business (a Tenant, or a raw tenants row), with India as the default for older rows. */
export function regionOf(t: { country?: string | null; currency?: string | null; timezone?: string | null; weightUnit?: string | null; weight_unit?: string | null } | null | undefined): Region {
  if (!t) return INDIA_REGION;
  const c = countryOf(t.country ?? "IN");
  const unit = (t.weightUnit ?? t.weight_unit) === "lb" ? "lb" : (t.weightUnit ?? t.weight_unit) === "kg" ? "kg" : c.unit;
  return { country: c.code, currency: (t.currency || c.currency).toUpperCase(), timezone: validZone(t.timezone) ?? c.timezone, unit };
}

function validZone(tz: string | null | undefined): string | undefined {
  if (!tz) return undefined;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();
function memo<T extends Intl.NumberFormat | Intl.DateTimeFormat>(key: string, make: () => T): T {
  let f = cache.get(key) as T | undefined;
  if (!f) cache.set(key, (f = make()));
  return f;
}

// Dates stay in English (the app is in English); India keeps "13 Oct", the US gets "Oct 13".
const dateLocale = (country: string) => (country === "IN" ? "en-IN" : country === "US" || country === "PH" ? "en-US" : "en-GB");

export interface Formatter {
  region: Region;
  /** ₹1,250 · $26.27 · 26,27 € */
  money: (n: number) => string;
  /** the price per kg as the business quotes it: ₹54/kg · $1.99/lb */
  rate: (pricePerKg: number) => string;
  /** a price per kg in the business's unit, as a plain number (for forms) */
  ratePerUnit: (pricePerKg: number) => number;
  /** 5.2 kg · 11.5 lb */
  weight: (kg: number) => string;
  /** a weight in the business's unit, as a plain number */
  weightValue: (kg: number) => number;
  unit: WeightUnit;
  symbol: string;
  date: (iso: string) => string;
  dateTime: (iso: string) => string;
}

export function formatterFor(r: Region): Formatter {
  const c = countryOf(r.country);
  const cents = hasCents(r.currency);
  const numberLocale = r.currency === "INR" ? "en-IN" : c.code === "XX" ? "en-US" : c.locale;
  const money = memo(`m:${numberLocale}:${r.currency}`, () =>
    new Intl.NumberFormat(numberLocale, { style: "currency", currency: r.currency, minimumFractionDigits: 0, maximumFractionDigits: cents ? 2 : 0 }),
  );
  const exact = memo(`x:${numberLocale}:${r.currency}`, () =>
    new Intl.NumberFormat(numberLocale, { style: "currency", currency: r.currency, minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }),
  );
  const dl = dateLocale(c.code);
  const dt = memo(`dt:${dl}:${r.timezone}`, () => new Intl.DateTimeFormat(dl, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: r.timezone }));
  const d = memo(`d:${dl}:${r.timezone}`, () => new Intl.DateTimeFormat(dl, { day: "numeric", month: "short", timeZone: r.timezone }));
  const symbol = exact.formatToParts(0).find((p) => p.type === "currency")?.value ?? r.currency;
  const perUnit = (pricePerKg: number) => (r.unit === "lb" ? pricePerKg * KG_PER_LB : pricePerKg);
  // whole amounts look cleaner without ".00" ($26 not $26.00), but a bill with cents always shows both digits
  const fmtMoney = (n: number) => (cents && Math.round(n * 100) % 100 !== 0 ? exact.format(n) : money.format(n));
  return {
    region: r,
    money: fmtMoney,
    rate: (p) => `${cents ? exact.format(Math.round(perUnit(p) * 100) / 100) : money.format(Math.round(perUnit(p)))}/${r.unit}`,
    ratePerUnit: (p) => Math.round(perUnit(p) * 100) / 100,
    weight: (kg) => `${(r.unit === "lb" ? kg / KG_PER_LB : kg).toFixed(1)} ${r.unit}`,
    weightValue: (kg) => Math.round((r.unit === "lb" ? kg / KG_PER_LB : kg) * 10) / 10,
    unit: r.unit,
    symbol,
    date: (iso) => d.format(new Date(iso)),
    dateTime: (iso) => dt.format(new Date(iso)),
  };
}

/** A typed weight in the business's unit, back to kg. */
export const toKg = (value: number, unit: WeightUnit) => (unit === "lb" ? value * KG_PER_LB : value);
/** A typed price per unit, back to per kg (how it's stored). */
export const pricePerKgFrom = (perUnit: number, unit: WeightUnit) => (unit === "lb" ? perUnit / KG_PER_LB : perUnit);

export const INDIA_FORMAT = formatterFor(INDIA_REGION);

// The Toss subscription is priced in rupees for Indian businesses and in US dollars for everyone else.
const USD_FORMAT = formatterFor({ country: "US", currency: "USD", timezone: "America/New_York", unit: "lb" });
export const subscriptionCurrency = (t: { currency?: string | null } | null | undefined) => ((t?.currency ?? "INR") === "INR" ? "INR" : "USD");
export const subscriptionFormat = (t: { currency?: string | null } | null | undefined) => (subscriptionCurrency(t) === "INR" ? INDIA_FORMAT : USD_FORMAT);
/** money in any currency (owner pages list businesses that pay in different ones) */
export const moneyIn = (n: number, currency: string) => (currency === "INR" ? INDIA_FORMAT : currency === "USD" ? USD_FORMAT : formatterFor({ ...INDIA_REGION, country: "XX", currency })).money(n);
