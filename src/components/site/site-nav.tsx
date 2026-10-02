"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, useMotionTemplate, useScroll, useTransform } from "framer-motion";
import { List, X } from "@phosphor-icons/react";
import { ThemeToggle } from "@/components/theme-toggle";

const LINKS = [
  { label: "How it works", href: "#how" },
  { label: "Inside Toss", href: "#inside" },
  { label: "Who it's for", href: "#roles" },
  { label: "Why Toss", href: "#why" },
];

// Floating glass pill. Over the first 50px of scroll the glass thickens (more tint, more blur) so the
// nav stays readable over the hero photo without a heavy bar at the top of the page.
export function SiteNav({ logo }: { logo: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();
  const tint = useTransform(scrollY, [0, 50], [0.02, 0.08]);
  const blur = useTransform(scrollY, [0, 50], [8, 24]);
  const background = useMotionTemplate`rgba(255, 255, 255, ${tint})`;
  const backdropFilter = useMotionTemplate`blur(${blur}px) saturate(160%)`;

  return (
    <header className="fixed inset-x-0 top-6 z-50 px-4">
      <motion.nav
        aria-label="Main"
        style={{ background, backdropFilter, WebkitBackdropFilter: backdropFilter }}
        className={`nav-glass mx-auto max-w-5xl border border-ink/10 shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_20px_50px_-20px_rgb(0_0_0/0.6)] transition-[border-radius] duration-300 ${open ? "rounded-3xl" : "rounded-full"}`}
      >
        <div className="flex h-16 items-center justify-between gap-4 pr-2 pl-5">
          <Link href="/" aria-label="Toss home" className="shrink-0">
            {logo}
          </Link>
          <ul className="hidden items-center gap-7 text-sm text-secondary md:flex">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="group relative py-1 transition-colors hover:text-fg">
                  {l.label}
                  <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-fg transition-all duration-300 group-hover:w-full" />
                </a>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <Link href="/login" className="hidden rounded-full px-4 py-2 text-sm text-secondary transition-colors hover:text-fg sm:block">
              Sign in
            </Link>
            <Link href="/login" className="btn-primary rounded-full px-5 py-2.5 text-sm font-semibold">
              Get started
            </Link>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              className="grid size-10 place-items-center rounded-full text-fg md:hidden"
            >
              {open ? <X size={22} weight="bold" /> : <List size={22} weight="bold" />}
            </button>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {open && (
            <motion.ul
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
              className="overflow-hidden px-5 md:hidden"
            >
              {[...LINKS, { label: "Sign in", href: "/login" }].map((l) => (
                <li key={l.label} className="border-t border-ink/10 first:border-0">
                  <a href={l.href} onClick={() => setOpen(false)} className="block py-3.5 text-lg font-medium text-fg">
                    {l.label}
                  </a>
                </li>
              ))}
              <li className="pb-4" />
            </motion.ul>
          )}
        </AnimatePresence>
      </motion.nav>
    </header>
  );
}
