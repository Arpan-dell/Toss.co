"use client";

import { useEffect } from "react";

// Global interaction layer, mounted once in the root layout:
// - scroll reveal for any element with [data-reveal]
// - click ripple on .btn-primary, .btn-ghost and [data-ripple]
export function Effects() {
  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.classList.add("fx");

    // ---- Scroll reveal ----
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          const delay = el.dataset.revealDelay;
          if (delay) el.style.transitionDelay = `${delay}ms`;
          el.classList.add("is-visible");
          io.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    const scan = () =>
      document.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-visible)").forEach((el) => {
        if (reduce) el.classList.add("is-visible");
        else io.observe(el);
      });
    scan();
    // Client-side navigation swaps page content; pick up newly rendered elements. Batched to one scan per
    // frame: count-ups and live data mutate the DOM constantly and must not each trigger a full query.
    let queued = 0;
    const mo = new MutationObserver(() => {
      if (!queued) queued = requestAnimationFrame(() => ((queued = 0), scan()));
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // ---- Ripple ----
    const onDown = (e: PointerEvent) => {
      if (reduce) return;
      const el = (e.target as Element).closest?.<HTMLElement>(".btn-primary, .btn-ghost, [data-ripple]");
      if (!el) return;
      const r = el.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 2.2;
      const ripple = document.createElement("span");
      ripple.className = "ripple";
      ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
      el.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove());
    };

    document.addEventListener("pointerdown", onDown);
    return () => {
      io.disconnect();
      mo.disconnect();
      cancelAnimationFrame(queued);
      document.removeEventListener("pointerdown", onDown);
    };
  }, []);

  return <div className="scroll-progress" aria-hidden />;
}
