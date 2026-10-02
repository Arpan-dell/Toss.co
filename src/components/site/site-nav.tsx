"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, useMotionTemplate, useScroll, useTransform } from "framer-motion";
import { List, X } from "@phosphor-icons/react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useDocked } from "./use-docked";
import { Tip } from "@/components/ui";

const LINKS = [
  { label: "How it works", href: "#how" },
  { label: "Inside Toss", href: "#inside" },
  { label: "Who it's for", href: "#roles" },
  { label: "Why Toss", href: "#why" },
];

// Floating glass pill for the top of the page. Once you scroll, it slides up out of view and the bottom
// dock (SiteDock) takes over, so there is only ever one menu on screen.
export function SiteNav({ logo }: { logo: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const docked = useDocked();
  const hidden = docked && !open;
  const { scrollY } = useScroll();
  const tint = useTransform(scrollY, [0, 50], [0.02, 0.08]);
  const blur = useTransform(scrollY, [0, 50], [8, 24]);
  const background = useMotionTemplate`rgba(255, 255, 255, ${tint})`;
  const backdropFilter = useMotionTemplate`blur(${blur}px) saturate(160%)`;

  return (
    <motion.header
      initial={false}
      animate={{ y: hidden ? -120 : 0, opacity: hidden ? 0 : 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      inert={hidden}
      className={`fixed inset-x-0 top-6 z-50 px-4 ${hidden ? "pointer-events-none" : ""}`}
    >
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
            <span className="md:hidden">
              <Tip label={open ? "Close menu" : "Menu"}>
                <button
                  type="button"
                  onClick={() => setOpen((o) => !o)}
                  aria-label={open ? "Close menu" : "Open menu"}
                  aria-expanded={open}
                  className="grid size-10 place-items-center rounded-full text-fg"
                >
                  {open ? <X size={22} weight="bold" /> : <List size={22} weight="bold" />}
                </button>
              </Tip>
            </span>
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
    </motion.header>
  );
}
