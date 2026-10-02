"use client";

import { useSyncExternalStore } from "react";
import type { BasketColor } from "./basket-colors";

// The filament colour chosen anywhere on the landing page (3D showcase swatches or the order form), shared
// between sections that don't have a common client parent.
let current: BasketColor = "black";
const listeners = new Set<() => void>();

export function setBasketColor(c: BasketColor) {
  current = c;
  listeners.forEach((l) => l());
}

export function useBasketColor(): [BasketColor, (c: BasketColor) => void] {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => "black" as BasketColor,
  );
  return [value, setBasketColor];
}
