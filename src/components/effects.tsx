"use client";

import { useEffect } from "react";

// Global interaction layer, mounted once in the root layout:
// - scroll reveal for any element with [data-reveal]
// - cursor spotlight on .glow-card
// - click ripple on .btn-primary, .btn-ghost and [data-ripple]
// - html[data-scrolled] once the page has scrolled (sticky header styling)
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

    // ---- Spotlight ----
    const onMove = (e: PointerEvent) => {
      const card = (e.target as Element).closest?.<HTMLElement>(".glow-card");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    };

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

    // ---- Scrolled flag ----
    // only touch <html> when the flag flips: any attribute write on the root invalidates page-wide styles
    let scrolled: boolean | undefined;
    const onScroll = () => {
      const now = window.scrollY > 8;
      if (now !== scrolled) root.toggleAttribute("data-scrolled", (scrolled = now));
    };
    onScroll();

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      mo.disconnect();
      cancelAnimationFrame(queued);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return <div className="scroll-progress" aria-hidden />;
}
