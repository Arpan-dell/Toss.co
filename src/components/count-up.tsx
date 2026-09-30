"use client";

import { useEffect, useState } from "react";

// Animates the first number inside a formatted string ("₹12,340", "3 / 5", "4.2 h"),
// keeping its prefix, suffix, decimals and Indian digit grouping.
export function CountUp({ value, duration = 1100 }: { value: string; duration?: number }) {
  const match = value.match(/[\d,]+(\.\d+)?/);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (!match || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = parseFloat(match[0].replace(/,/g, ""));
    const decimals = match[1] ? match[1].length - 1 : 0;
    const grouped = match[0].includes(",");
    const [before, after] = [value.slice(0, match.index), value.slice(match.index! + match[0].length)];
    const start = performance.now();
    let raf = 0;

    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const n = target * eased;
      const s = grouped
        ? n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : n.toFixed(decimals);
      setDisplay(before + s + after);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return <>{display}</>;
}
