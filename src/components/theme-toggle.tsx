"use client";

import { Moon, Sun } from "@phosphor-icons/react";
import { Tip } from "./ui";

export const THEME_KEY = "toss-theme";

// Runs in <head> before paint so the saved theme never flashes the other one. Light is the default.
export const themeInitScript = `try{document.documentElement.dataset.theme=localStorage.getItem("${THEME_KEY}")==="dark"?"dark":"light"}catch(e){}`;

// Flips the theme and saves it. Where the browser supports view transitions, the new theme spreads out
// from the click point as a growing circle. Used by the nav toggle and the dock.
export function switchTheme(e: React.MouseEvent) {
  const root = document.documentElement;
  const apply = () => {
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
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
