"use client";

import Image from "next/image";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

// Real screens from Toss (demo business data). The screenshots are of the dark dashboard, so the gallery
// stays a dark island (data-theme="dark") in both themes to keep captions and screens readable.
// Hover, focus or tap a panel and it expands while the
// others shrink; the open panel says what you're looking at.
const SHOTS = [
  { src: "/brand/site/shot-customer.webp", title: "Your laundry, at a glance", body: "Customers see the active pickup, their basket's fill level and any invoice to pay." },
  { src: "/brand/site/shot-live.webp", title: "The live board", body: "Every pickup in the city, assigned to the nearest driver the second a basket fills." },
  { src: "/brand/site/shot-ai.webp", title: "Toss AI briefing", body: "A health score and a written plan every morning: who to win back, what money is stuck." },
  { src: "/brand/site/shot-analytics.webp", title: "Demand, by day and week", body: "See which days run hot so you staff before the rush, not during it." },
  { src: "/brand/site/shot-payments.webp", title: "Payments without chasing", body: "UPI references to verify, cash to mark, and what's still outstanding." },
];
const EASE = [0.25, 1, 0.5, 1] as const;

export function InsideGallery() {
  const [active, setActive] = useState(2);
  const reduce = useReducedMotion();
  return (
    <div data-theme="dark" className="flex h-[640px] flex-col gap-3 md:h-[440px] md:flex-row">
      {SHOTS.map((s, i) => {
        const open = i === active;
        return (
          <button
            key={s.src}
            type="button"
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
            aria-pressed={open}
            aria-label={s.title}
            style={{ flex: `${open ? 4 : 0.8} 1 0%`, transition: reduce ? "none" : "flex-grow 0.6s cubic-bezier(0.25, 1, 0.5, 1)" }}
            className="group relative min-h-0 min-w-0 overflow-hidden rounded-3xl border border-ink/10 bg-surface-solid text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Image
              src={s.src}
              alt=""
              fill
              loading="lazy"
              sizes="(min-width: 768px) 60vw, 100vw"
              className={`object-cover object-top transition-[transform,opacity] duration-1000 group-hover:scale-105 ${open ? "opacity-100" : "opacity-40"}`}
            />
            <div className={`absolute inset-0 bg-gradient-to-t from-bg from-15% via-bg/85 via-40% to-transparent to-75% transition-opacity duration-500 ${open ? "opacity-100" : "opacity-50"}`} />
            <motion.div
              initial={false}
              animate={{ opacity: open ? 1 : 0, y: open ? 0 : 12 }}
              transition={{ duration: 0.45, delay: open ? 0.2 : 0, ease: EASE }}
              className="absolute inset-x-0 bottom-0 p-6 sm:p-8"
            >
              <p className="text-2xl font-bold tracking-tight text-fg">{s.title}</p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-secondary">{s.body}</p>
            </motion.div>
          </button>
        );
      })}
    </div>
  );
}
