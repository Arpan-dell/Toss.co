"use client";

import { Moon, Sun } from "@phosphor-icons/react";
import { Tip } from "./ui";

export const THEME_KEY = "toss-theme";

// The choice lives in a cookie on the parent domain (".tosslaundry.online"), so the website and the app
// (app.tosslaundry.online, a separate origin with its own localStorage) open in the same theme. localStorage is
// kept as a fallback for other hosts and to carry over choices saved before the cookie existed.
const COOKIE_DOMAIN = "tosslaundry.online";
const cookieAttrs = `path=/; max-age=31536000; SameSite=Lax`;

// Runs first thing in <body>, before paint, so the saved theme never flashes the other one. Light is the default.
export const themeInitScript = `try{var h=location.hostname,d=h==="${COOKIE_DOMAIN}"||h.endsWith(".${COOKIE_DOMAIN}")?"; domain=.${COOKIE_DOMAIN}":"",m=document.cookie.match(/(?:^|; )${THEME_KEY}=(dark|light)/),c=m&&m[1],l=localStorage.getItem("${THEME_KEY}"),t=c||l||"light";if(!c&&l)document.cookie="${THEME_KEY}="+l+"; ${cookieAttrs}"+d;document.documentElement.dataset.theme=t==="dark"?"dark":"light"}catch(e){}`;

function saveTheme(theme: "dark" | "light") {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
  const h = location.hostname;
  const domain = h === COOKIE_DOMAIN || h.endsWith(`.${COOKIE_DOMAIN}`) ? `; domain=.${COOKIE_DOMAIN}` : "";
  document.cookie = `${THEME_KEY}=${theme}; ${cookieAttrs}${domain}`;
}

// Flips the theme and saves it. Where the browser supports view transitions, the new theme spreads out
// from the click point as a growing circle. Used by the nav toggle and the dock.
export function switchTheme(e: React.MouseEvent) {
  const root = document.documentElement;
  const apply = () => {
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    saveTheme(next);
  };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !document.startViewTransition) return apply();

  const { clientX: x, clientY: y } = e;
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.startViewTransition(apply).ready.then(() => {
    root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 600, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" },
    );
  });
}

// Light/dark button. The icon is picked by CSS (light: variant), so it is right on first paint with no
// hydration mismatch.
export function ThemeToggle({ className = "" }: { className?: string }) {
  return (
    <Tip label="Switch theme">
      <button
        type="button"
        onClick={switchTheme}
        aria-label="Switch between light and dark theme"
        className={`grid size-10 shrink-0 place-items-center rounded-full text-secondary transition-colors hover:bg-ink/[0.07] hover:text-fg ${className}`}
      >
        <Sun size={20} weight="bold" className="light:hidden" />
        <Moon size={20} weight="bold" className="hidden light:block" />
      </button>
    </Tip>
  );
}
