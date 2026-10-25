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
    const watch = (el: HTMLElement) => {
      if (el.classList.contains("is-visible")) return;
      if (reduce) el.classList.add("is-visible");
      else io.observe(el);
    };
    const scanIn = (root: ParentNode) => {
      if (root instanceof HTMLElement && root.hasAttribute("data-reveal")) watch(root);
      root.querySelectorAll?.<HTMLElement>("[data-reveal]").forEach(watch);
    };
    scanIn(document);
    // Client-side navigation swaps page content: look only inside the nodes that were added (count-ups, live
    // data and animations change the page constantly; re-scanning the whole page each time made it stutter).
    let added: Node[] = [];
    let queued = 0;
    const mo = new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) added.push(n);
      if (added.length && !queued)
        queued = requestAnimationFrame(() => {
          queued = 0;
          const batch = added;
          added = [];
          for (const n of batch) if ((n as Element).isConnected) scanIn(n as Element);
        });
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
