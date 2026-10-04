"use client";

import { useSyncExternalStore } from "react";

// The user's reduced-motion preference, safe for server rendering: it reads "false" on the server and during
// hydration, then the real value, so the server HTML and the first client render always match. framer-motion's
// useReducedMotion reads the media query on the very first client render, which made every component that
// branches on it fail hydration (React #418) for reduced-motion users.
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
