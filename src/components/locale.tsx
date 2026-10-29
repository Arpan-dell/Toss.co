"use client";

import { createContext, useContext, useMemo } from "react";
import { Translate } from "@phosphor-icons/react";
import { LANG_COOKIE, LOCALES, translator, type Locale, type T } from "@/lib/i18n";
import { Tip } from "./ui";

// The language for Client Components. Portals and sign-in pages read the cookie on the server and pass it down here,
// so the first paint is already in the right language.
const LocaleContext = createContext<Locale>("en");

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

export const useLocale = () => useContext(LocaleContext);

/** The translate function for the language on screen. */
export function useT(): T {
  const locale = useLocale();
  return useMemo(() => translator(locale), [locale]);
}

// shared by the website and the app host, like the theme cookie
const COOKIE_DOMAIN = "tosslaundry.online";

/** Switch language: saves the choice for a year and reloads the page in it. */
export function setLanguage(next: Locale) {
  const h = location.hostname;
  const domain = h === COOKIE_DOMAIN || h.endsWith(`.${COOKIE_DOMAIN}`) ? `; domain=.${COOKIE_DOMAIN}` : "";
  document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax${domain}`;
  // the website's Hindi pages live under /hi; everything else reads the cookie
  const path = location.pathname;
  if (next === "en" && (path === "/hi" || path.startsWith("/hi/"))) location.assign(path.slice(3) || "/");
  else location.reload();
}

/** The हिं / EN button in the header. */
export function LanguageToggle({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const other = LOCALES.find((l) => l.code !== locale)!;
  const label = locale === "hi" ? "Switch to English" : "हिंदी में देखें";
  return (
    <Tip label={label}>
      <button
        type="button"
        onClick={() => setLanguage(other.code)}
        aria-label={label}
        lang={other.code}
        className={`btn-ghost inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-secondary hover:text-fg ${className}`}
      >
        <Translate size={15} aria-hidden />
        {other.short}
      </button>
    </Tip>
  );
}

/**
 * Translated text, for components that don't have t() at hand (shared bits used by server and client pages alike):
 * <Tr>Paid</Tr>. It reads the language from the nearest LocaleProvider.
 */
export function Tr({ children, vars }: { children: string; vars?: Record<string, string | number> }) {
  return useT()(children, vars);
}
