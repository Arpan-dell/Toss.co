"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { House, PlayCircle, SignIn, Sparkle, SquaresFour, TelegramLogo, UsersThree, type Icon } from "@phosphor-icons/react";
import { Dock, DockIcon, DockItem, DockLabel } from "@/components/core/dock";

const ITEMS: { title: string; href: string; icon: Icon; section?: string; desktopOnly?: boolean }[] = [
  { title: "Home", href: "#top", icon: House, section: "top" },
  { title: "How it works", href: "#how", icon: PlayCircle, section: "how" },
  { title: "Inside Toss", href: "#inside", icon: SquaresFour, section: "inside" },
  { title: "Who it's for", href: "#roles", icon: UsersThree, section: "roles" },
  { title: "Why Toss", href: "#why", icon: Sparkle, section: "why" },
  { title: "Driver bot", href: "https://t.me/toss_driver_bot", icon: TelegramLogo, desktopOnly: true },
  { title: "Sign in", href: "/login", icon: SignIn },
];

// Floating dock that takes over navigation once the hero is behind you. The dot marks the section in view.
export function SiteDock() {
  const { scrollY } = useScroll();
  const [shown, setShown] = useState(false);
  const [active, setActive] = useState("top");
  useMotionValueEvent(scrollY, "change", (y) => setShown(y > window.innerHeight * 0.6));

  useEffect(() => {
    const els = ITEMS.flatMap((i) => (i.section && i.section !== "top" ? [document.getElementById(i.section)] : [])).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    els.forEach((el) => io.observe(el));
    const top = () => window.scrollY < window.innerHeight && setActive("top");
    window.addEventListener("scroll", top, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", top);
    };
  }, []);

  return (
    <AnimatePresence>
      {shown && (
        <motion.nav
          aria-label="Sections"
          initial={{ y: 90, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 90, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          className="fixed bottom-3 left-1/2 z-40 max-w-full -translate-x-1/2"
        >
          <Dock className="items-end rounded-2xl border border-ink/10 bg-surface-solid/75 pb-2.5 shadow-[0_20px_50px_-15px_rgb(0_0_0/0.7),inset_0_1px_0_rgb(255_255_255/0.08)] light:shadow-[0_18px_40px_-18px_rgb(11_20_48/0.35)] backdrop-blur-xl">
            {ITEMS.map((item) => {
              const on = item.section === active;
              return (
                <DockItem
                  key={item.title}
                  href={item.href}
                  aria-label={item.title}
                  className={`aspect-square rounded-full transition-colors ${on ? "bg-accent/15 text-accent" : "bg-ink/[0.07] text-secondary hover:text-fg"} ${item.desktopOnly ? "max-sm:hidden" : ""}`}
                >
                  <DockLabel>{item.title}</DockLabel>
                  <DockIcon>
                    <item.icon size="100%" weight={on ? "fill" : "regular"} />
                  </DockIcon>
                  {on && <motion.span layoutId="dock-dot" className="absolute -bottom-2 size-1 rounded-full bg-accent" />}
                </DockItem>
              );
            })}
          </Dock>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
