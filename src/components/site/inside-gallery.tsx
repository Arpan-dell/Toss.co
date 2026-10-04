"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight } from "@phosphor-icons/react";
import { appHref } from "@/lib/hosts";

// Real screens from Toss (demo business data), shown as an expanding strip gallery on a dark stage.
// Each screen gets its own filament colour (the same palette the basket is printed in), so the closed strips
// read as a row of colour instead of five navy dashboards. Hover, focus or tap a strip to open it.
const SHOTS = [
  { src: "/brand/site/shot-customer.webp", tag: "Customer app", title: "Your laundry, at a glance", body: "Customers see the active pickup, their basket's fill level and any invoice to pay.", color: "#16b0a0" },
  { src: "/brand/site/shot-live.webp", tag: "Live board", title: "Every pickup, live", body: "Every pickup in the city, assigned to the nearest driver the second a basket fills.", color: "#f57620" },
  { src: "/brand/site/shot-ai.webp", tag: "Toss AI", title: "A morning briefing", body: "A health score and a written plan every morning: who to win back, what money is stuck.", color: "#4c7dff" },
  { src: "/brand/site/shot-analytics.webp", tag: "Analytics", title: "Demand, by day", body: "See which days run hot so you staff before the rush, not during it.", color: "#e0364a" },
  { src: "/brand/site/shot-payments.webp", tag: "Payments", title: "Paid, not chased", body: "UPI references to verify, cash to mark, and what's still outstanding.", color: "#2eaa54" },
];
const EASE = [0.25, 1, 0.5, 1] as const;
const INK = "#07090f";

export function InsideGallery() {
  const [active, setActive] = useState(2);
  const reduce = useReducedMotion();
  return (
    <div data-theme="dark" className="rounded-[28px] bg-[#05070c] p-2.5 shadow-[0_30px_80px_-30px_rgb(5_7_12/0.6)] sm:p-3">
      <div className="flex h-[680px] flex-col gap-2.5 md:h-[480px] md:flex-row sm:gap-3">
        {SHOTS.map((s, i) => {
          const open = i === active;
          const n = String(i + 1).padStart(2, "0");
          return (
            <div
              key={s.src}
              onMouseEnter={() => setActive(i)}
              style={{ flex: `${open ? 5 : 0.7} 1 0%`, transition: reduce ? "none" : "flex-grow 0.65s cubic-bezier(0.25, 1, 0.5, 1)", background: s.color }}
              className={`relative min-h-0 min-w-0 overflow-hidden transition-[border-radius] duration-500 ${open ? "rounded-[22px]" : "rounded-[22px] md:rounded-[44px]"}`}
            >
              {/* closed: the screen as a duotone in this strip's colour; open: the real screen */}
              <Image
                src={s.src}
                alt=""
                fill
                loading="lazy"
                sizes="(min-width: 768px) 60vw, 100vw"
                className={`object-cover object-top transition-[opacity,filter,transform] duration-700 ${
                  open ? "scale-100 opacity-100" : "scale-110 opacity-35 blur-[1.5px] mix-blend-luminosity"
                }`}
              />
              {/* the open screen takes a wash of its own colour, so each one looks different */}
              <div
                aria-hidden
                className={`absolute inset-0 mix-blend-color transition-opacity duration-500 ${open ? "opacity-45" : "opacity-0"}`}
                style={{ background: s.color }}
              />
              <div
                aria-hidden
                className="absolute inset-0 transition-opacity duration-500"
                style={{
                  opacity: open ? 1 : 0.55,
                  background: open
                    ? `linear-gradient(to top, ${INK} 22%, color-mix(in srgb, ${s.color} 20%, ${INK}) 50%, transparent 80%)`
                    : `linear-gradient(to top, ${INK}, transparent 70%)`,
                }}
              />

              <button
                type="button"
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                aria-pressed={open}
                aria-label={`${s.tag}: ${s.title}`}
                className="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-inset"
              />

              {/* closed label: number on top, title running up the strip (across it on phones) */}
              <div
                aria-hidden
                className={`pointer-events-none absolute inset-0 flex items-center justify-between px-5 transition-opacity duration-300 md:flex-col md:items-start md:justify-between md:px-0 md:py-6 ${
                  open ? "opacity-0" : "opacity-100 delay-200"
                }`}
              >
                <span className="font-mono text-[11px] tracking-[0.14em] text-white/80 md:self-center">{n}</span>
                <span className="text-sm font-bold tracking-[0.12em] whitespace-nowrap text-white uppercase md:self-center md:[writing-mode:vertical-rl] md:rotate-180">
                  {s.tag}
                </span>
              </div>

              {/* open caption */}
              <motion.div
                initial={false}
                animate={{ opacity: open ? 1 : 0, y: open ? 0 : 14 }}
                transition={{ duration: 0.45, delay: open ? 0.25 : 0, ease: EASE }}
                className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 p-6 sm:p-8"
              >
                <div className="min-w-0">
                  <p className="font-mono text-[11px] tracking-[0.16em] uppercase" style={{ color: `color-mix(in srgb, ${s.color} 70%, white)` }}>
                    {n} — {s.tag}
                  </p>
                  <p className="mt-2 text-[clamp(1.7rem,3.4vw,2.8rem)] leading-[1.05] font-black tracking-tight text-white">{s.title}</p>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-white/75 sm:text-base">{s.body}</p>
                </div>
                <Link
                  href={appHref("/login")}
                  tabIndex={open ? 0 : -1}
                  aria-label={`Sign in to see ${s.tag.toLowerCase()}`}
                  title="Sign in to see it"
                  className={`grid size-12 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:bg-white hover:text-[#05070c] focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none ${
                    open ? "pointer-events-auto" : ""
                  }`}
                >
                  <ArrowUpRight size={20} weight="bold" />
                </Link>
              </motion.div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
