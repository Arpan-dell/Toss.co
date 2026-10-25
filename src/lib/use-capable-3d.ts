"use client";

import { useSyncExternalStore } from "react";

// Whether this device should get the live 3D basket (three.js: ~1 MB of script and a WebGL scene). Phones, budget
// devices (4 or fewer cores, 4 GB or less memory) and Data Saver keep the real product photo instead, so the page
// stays smooth for them. false on the server and during hydration; the real answer arrives right after.
type Nav = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

// Off for everyone for now: smoothness comes first, and the product photo looks good. Delete this line to bring
// the 3D basket back on capable desktops.
const LIVE_3D = false;

function check(): boolean {
  if (!LIVE_3D) return false;
  const n = navigator as Nav;
  if (n.connection?.saveData) return false;
  if ((n.hardwareConcurrency ?? 8) <= 4) return false;
  if ((n.deviceMemory ?? 8) <= 4) return false;
  if (window.matchMedia("(max-width: 767px)").matches) return false;
  return true;
}

const subscribe = () => () => {};
export const useCapable3D = () => useSyncExternalStore(subscribe, check, () => false);
