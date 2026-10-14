// Where a laundry business operates, and what follows from it: currency, time zone, kg or lb, what tax is called,
// the phone country code, and the ways its customers usually pay. India keeps UPI; elsewhere it's the local
// equivalents (PayPal and Venmo in the US, SEPA bank transfer in the euro area, Pix in Brazil…). The business can
// change any of these in Settings; this is only the starting point, picked from the country.

export type WeightUnit = "kg" | "lb";

// How customers can pay a business. Each one sends money straight to the business, like UPI: Toss never holds it.
export type PayMethodId =
  | "upi"
  | "paypal"
  | "venmo"
  | "cashapp"
  | "zelle"
  | "interac"
  | "sepa"
  | "bank"
  | "pix"
  | "paynow"
  | "mpesa"
  | "gcash"
  | "link"
  | "cash";

export interface Country {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  currency: string; // ISO 4217
  locale: string; // for numbers and dates
  timezone: string; // the usual one (the business can pick another)
  unit: WeightUnit;
  dial: string; // phone country code, without "+"
  tax: string; // what sales tax is called
  methods: PayMethodId[]; // the usual ways to pay, most common first ("cash" is always available)
}

const EURO: Omit<Country, "code" | "name" | "locale" | "timezone" | "dial"> = { currency: "EUR", unit: "kg", tax: "VAT", methods: ["sepa", "paypal", "link", "cash"] };

export const COUNTRIES: Country[] = [
  { code: "IN", name: "India", currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata", unit: "kg", dial: "91", tax: "GST", methods: ["upi", "cash"] },
  { code: "US", name: "United States", currency: "USD", locale: "en-US", timezone: "America/New_York", unit: "lb", dial: "1", tax: "Sales tax", methods: ["venmo", "cashapp", "zelle", "paypal", "link", "cash"] },
  { code: "CA", name: "Canada", currency: "CAD", locale: "en-CA", timezone: "America/Toronto", unit: "lb", dial: "1", tax: "GST/HST", methods: ["interac", "paypal", "link", "cash"] },
  { code: "GB", name: "United Kingdom", currency: "GBP", locale: "en-GB", timezone: "Europe/London", unit: "kg", dial: "44", tax: "VAT", methods: ["bank", "paypal", "link", "cash"] },
  { code: "IE", name: "Ireland", locale: "en-IE", timezone: "Europe/Dublin", dial: "353", ...EURO },
  { code: "DE", name: "Germany", locale: "de-DE", timezone: "Europe/Berlin", dial: "49", ...EURO },
  { code: "FR", name: "France", locale: "fr-FR", timezone: "Europe/Paris", dial: "33", ...EURO },
  { code: "ES", name: "Spain", locale: "es-ES", timezone: "Europe/Madrid", dial: "34", ...EURO },
  { code: "IT", name: "Italy", locale: "it-IT", timezone: "Europe/Rome", dial: "39", ...EURO },
  { code: "NL", name: "Netherlands", locale: "nl-NL", timezone: "Europe/Amsterdam", dial: "31", ...EURO },
  { code: "BE", name: "Belgium", locale: "nl-BE", timezone: "Europe/Brussels", dial: "32", ...EURO },
  { code: "AT", name: "Austria", locale: "de-AT", timezone: "Europe/Vienna", dial: "43", ...EURO },
  { code: "PT", name: "Portugal", locale: "pt-PT", timezone: "Europe/Lisbon", dial: "351", ...EURO },
  { code: "FI", name: "Finland", locale: "fi-FI", timezone: "Europe/Helsinki", dial: "358", ...EURO },
  { code: "GR", name: "Greece", locale: "el-GR", timezone: "Europe/Athens", dial: "30", ...EURO },
  { code: "CH", name: "Switzerland", currency: "CHF", locale: "de-CH", timezone: "Europe/Zurich", unit: "kg", dial: "41", tax: "VAT", methods: ["bank", "paypal", "link", "cash"] },
  { code: "SE", name: "Sweden", currency: "SEK", locale: "sv-SE", timezone: "Europe/Stockholm", unit: "kg", dial: "46", tax: "VAT", methods: ["bank", "paypal", "link", "cash"] },
  { code: "NO", name: "Norway", currency: "NOK", locale: "nb-NO", timezone: "Europe/Oslo", unit: "kg", dial: "47", tax: "VAT", methods: ["bank", "paypal", "link", "cash"] },
  { code: "DK", name: "Denmark", currency: "DKK", locale: "da-DK", timezone: "Europe/Copenhagen", unit: "kg", dial: "45", tax: "VAT", methods: ["bank", "paypal", "link", "cash"] },
  { code: "PL", name: "Poland", currency: "PLN", locale: "pl-PL", timezone: "Europe/Warsaw", unit: "kg", dial: "48", tax: "VAT", methods: ["bank", "paypal", "link", "cash"] },
  { code: "AE", name: "United Arab Emirates", currency: "AED", locale: "en-AE", timezone: "Asia/Dubai", unit: "kg", dial: "971", tax: "VAT", methods: ["bank", "link", "cash"] },
  { code: "SA", name: "Saudi Arabia", currency: "SAR", locale: "en-SA", timezone: "Asia/Riyadh", unit: "kg", dial: "966", tax: "VAT", methods: ["bank", "link", "cash"] },
  { code: "QA", name: "Qatar", currency: "QAR", locale: "en-QA", timezone: "Asia/Qatar", unit: "kg", dial: "974", tax: "Tax", methods: ["bank", "link", "cash"] },
  { code: "AU", name: "Australia", currency: "AUD", locale: "en-AU", timezone: "Australia/Sydney", unit: "kg", dial: "61", tax: "GST", methods: ["bank", "paypal", "link", "cash"] },
  { code: "NZ", name: "New Zealand", currency: "NZD", locale: "en-NZ", timezone: "Pacific/Auckland", unit: "kg", dial: "64", tax: "GST", methods: ["bank", "paypal", "link", "cash"] },
  { code: "SG", name: "Singapore", currency: "SGD", locale: "en-SG", timezone: "Asia/Singapore", unit: "kg", dial: "65", tax: "GST", methods: ["paynow", "bank", "link", "cash"] },
  { code: "MY", name: "Malaysia", currency: "MYR", locale: "en-MY", timezone: "Asia/Kuala_Lumpur", unit: "kg", dial: "60", tax: "SST", methods: ["bank", "link", "cash"] },
  { code: "PH", name: "Philippines", currency: "PHP", locale: "en-PH", timezone: "Asia/Manila", unit: "kg", dial: "63", tax: "VAT", methods: ["gcash", "bank", "link", "cash"] },
  { code: "JP", name: "Japan", currency: "JPY", locale: "ja-JP", timezone: "Asia/Tokyo", unit: "kg", dial: "81", tax: "Consumption tax", methods: ["bank", "paypal", "link", "cash"] },
  { code: "BR", name: "Brazil", currency: "BRL", locale: "pt-BR", timezone: "America/Sao_Paulo", unit: "kg", dial: "55", tax: "Tax", methods: ["pix", "link", "cash"] },
  { code: "MX", name: "Mexico", currency: "MXN", locale: "es-MX", timezone: "America/Mexico_City", unit: "kg", dial: "52", tax: "IVA", methods: ["bank", "paypal", "link", "cash"] },
  { code: "ZA", name: "South Africa", currency: "ZAR", locale: "en-ZA", timezone: "Africa/Johannesburg", unit: "kg", dial: "27", tax: "VAT", methods: ["bank", "link", "cash"] },
  { code: "NG", name: "Nigeria", currency: "NGN", locale: "en-NG", timezone: "Africa/Lagos", unit: "kg", dial: "234", tax: "VAT", methods: ["bank", "link", "cash"] },
  { code: "KE", name: "Kenya", currency: "KES", locale: "en-KE", timezone: "Africa/Nairobi", unit: "kg", dial: "254", tax: "VAT", methods: ["mpesa", "bank", "link", "cash"] },
  { code: "PK", name: "Pakistan", currency: "PKR", locale: "en-PK", timezone: "Asia/Karachi", unit: "kg", dial: "92", tax: "Sales tax", methods: ["bank", "link", "cash"] },
  { code: "BD", name: "Bangladesh", currency: "BDT", locale: "en-BD", timezone: "Asia/Dhaka", unit: "kg", dial: "880", tax: "VAT", methods: ["bank", "link", "cash"] },
  { code: "NP", name: "Nepal", currency: "NPR", locale: "en-NP", timezone: "Asia/Kathmandu", unit: "kg", dial: "977", tax: "VAT", methods: ["bank", "link", "cash"] },
  { code: "LK", name: "Sri Lanka", currency: "LKR", locale: "en-LK", timezone: "Asia/Colombo", unit: "kg", dial: "94", tax: "VAT", methods: ["bank", "link", "cash"] },
];

/** Anywhere not listed: US dollars, kg, bank transfer, PayPal or a payment link. */
export const OTHER_COUNTRY: Country = {
  code: "XX",
  name: "Another country",
  currency: "USD",
  locale: "en-US",
  timezone: "UTC",
  unit: "kg",
  dial: "",
  tax: "Tax",
  methods: ["bank", "paypal", "link", "cash"],
};

export const INDIA = COUNTRIES[0];

export function countryOf(code: string | null | undefined): Country {
  const c = (code ?? "").toUpperCase();
  return COUNTRIES.find((x) => x.code === c) ?? (c && /^[A-Z]{2}$/.test(c) ? { ...OTHER_COUNTRY, code: c } : INDIA);
}

/** The country a visitor is probably in, from Vercel's geo header (two letters) or the browser language. */
export function detectCountry(geoHeader: string | null | undefined, acceptLanguage?: string | null): Country {
  const geo = (geoHeader ?? "").toUpperCase();
  if (/^[A-Z]{2}$/.test(geo)) return COUNTRIES.find((c) => c.code === geo) ?? { ...OTHER_COUNTRY, code: geo };
  const lang = (acceptLanguage ?? "").match(/[a-z]{2}-([A-Z]{2})/)?.[1];
  return COUNTRIES.find((c) => c.code === lang) ?? INDIA;
}

// The currencies people pay in, for the currency picker: every listed country's, plus a few common ones.
export const CURRENCIES = [...new Set([...COUNTRIES.map((c) => c.currency), "USD", "EUR", "GBP"])].sort();

// Currencies quoted in whole units day to day; everything else keeps cents. Matches public.money_round().
const WHOLE = new Set(["INR", "JPY", "KRW", "IDR", "VND", "CLP", "HUF", "PKR", "LKR", "NPR", "BDT", "NGN", "KES", "UGX", "TZS"]);
export const hasCents = (currency: string) => !WHOLE.has(currency.toUpperCase());
export function roundMoney(n: number, currency: string): number {
  return hasCents(currency) ? Math.round(n * 100) / 100 : Math.round(n);
}

export const KG_PER_LB = 0.45359237;

/** A bill for a weight: the business's price per kg, at least its minimum order, rounded for its currency. */
export function billFor(weightKg: number, b: { pricePerKg: number; minOrder?: number; currency: string }): number {
  const raw = weightKg * b.pricePerKg;
  return roundMoney(Math.max(raw, raw > 0 ? (b.minOrder ?? 0) : 0), b.currency);
}

// IANA time zones for the picker: the listed countries' ones plus UTC. The browser's own list is used when it has one.
export const COMMON_TIMEZONES = [...new Set([...COUNTRIES.map((c) => c.timezone), "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Vancouver", "Australia/Perth", "UTC"])].sort();
