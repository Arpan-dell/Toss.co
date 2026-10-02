"use client";

import { useEffect, useState } from "react";
import { useMotionValueEvent, useScroll } from "framer-motion";

// Past this many pixels of scroll the top nav slides away and the bottom dock takes over, so the
// page never shows two menus at once.
const DOCK_AFTER = 120;

export function useDocked() {
  const { scrollY } = useScroll();
  const [docked, setDocked] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setDocked(y > DOCK_AFTER));
  // a reload mid-page restores scroll without a change event
  useEffect(() => {
    const id = requestAnimationFrame(() => setDocked(window.scrollY > DOCK_AFTER));
    return () => cancelAnimationFrame(id);
  }, []);
  return docked;
}
