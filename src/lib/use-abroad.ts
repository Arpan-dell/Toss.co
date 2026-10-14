"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};
const INDIA_ZONES = new Set(["Asia/Kolkata", "Asia/Calcutta"]);

/**
 * True for visitors outside India, from the browser's time zone (no location lookup, nothing sent anywhere).
 * The server renders the Indian version; the browser switches after loading.
 */
export function useAbroad(): boolean {
  return useSyncExternalStore(
    noop,
    () => {
      try {
        return !INDIA_ZONES.has(Intl.DateTimeFormat().resolvedOptions().timeZone);
      } catch {
        return false;
      }
    },
    () => false,
  );
}
