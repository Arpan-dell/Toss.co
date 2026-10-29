import { HI } from "./hi";

// Toss in English and Hindi. The English text in the code is the key: t("Order history") gives "ऑर्डर हिस्ट्री" in
// Hindi, and any text without a Hindi line yet simply stays in English, so nothing ever shows blank.
// {name} placeholders are filled in after translating: t("Hi, {name}", { name }).
// The choice lives in the toss-lang cookie on the parent domain, like the theme, so the website and the app match.

export type Locale = "en" | "hi";
export const LANG_COOKIE = "toss-lang";
export const LOCALES: { code: Locale; label: string; short: string }[] = [
  { code: "en", label: "English", short: "EN" },
  { code: "hi", label: "हिंदी", short: "हिं" },
];

export type Vars = Record<string, string | number>;
export type T = (text: string, vars?: Vars) => string;

export const isLocale = (v: unknown): v is Locale => v === "en" || v === "hi";

const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s);

/** The translate function for one language. */
export function translator(locale: Locale): T {
  return (text, vars) => fill(locale === "hi" ? (HI[text] ?? text) : text, vars);
}

/** "hi-IN" or "en-IN", for dates and numbers. */
export const intlLocale = (locale: Locale) => (locale === "hi" ? "hi-IN" : "en-IN");

/** "Hindi mein karo", "switch to English", "हिंदी": a request to change the site's language, or null. */
export function languageRequest(raw: string): Locale | null {
  const t = raw.toLowerCase().replace(/\s+/g, " ").replace(/[?!.।]+$/, "").trim();
  if (!t) return null;
  if (/^(हिंदी|हिन्दी|hindi)( में| mein| me| please| pls)?$/.test(t)) return "hi";
  if (/^(english|अंग्रेज़ी|अंग्रेजी|इंग्लिश)( में| mein| me| please| pls)?$/.test(t)) return "en";
  const ask = /\b(switch|change|set|make|show|use|speak|talk|turn|open|kar|karo|kardo|kar do|badlo|badal|chahiye)\b|करो|कर दो|बदलो|बदलें|चाहिए|में दिखाओ/;
  if (/\b(hindi)\b|हिंदी|हिन्दी/.test(t) && ask.test(t)) return "hi";
  if (/\b(english|angrezi)\b|अंग्रेज़ी|अंग्रेजी|इंग्लिश/.test(t) && ask.test(t)) return "en";
  return null;
}
