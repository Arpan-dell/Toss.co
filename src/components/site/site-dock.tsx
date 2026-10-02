"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cube, House, MapPinArea, Moon, PlayCircle, SignIn, Sparkle, SquaresFour, Sun, TelegramLogo, UsersThree, type Icon } from "@phosphor-icons/react";
import { Dock, DockIcon, DockItem, DockLabel } from "@/components/core/dock";
import { switchTheme } from "@/components/theme-toggle";
import { useDocked } from "./use-docked";

const ITEMS: { title: string; href: string; icon: Icon; section?: string; desktopOnly?: boolean }[] = [
  { title: "Home", href: "#top", icon: House, section: "top", desktopOnly: true },
  { title: "The basket", href: "#basket", icon: Cube, section: "basket" },
  { title: "How it works", href: "#how", icon: PlayCircle, section: "how" },
  { title: "Inside Toss", href: "#inside", icon: SquaresFour, section: "inside" },
  { title: "Who it's for", href: "#roles", icon: UsersThree, section: "roles" },
  { title: "Why Toss", href: "#why", icon: Sparkle, section: "why", desktopOnly: true },
  { title: "Find a laundry", href: "/laundries", icon: MapPinArea },
  { title: "Driver bot", href: "https://t.me/toss_driver_bot", icon: TelegramLogo, desktopOnly: true },
  { title: "Sign in", href: "/login", icon: SignIn },
];

// Floating dock that replaces the top nav as soon as you scroll (see useDocked). The dot marks the section
// in view; the last button switches the theme, since the top nav and its toggle are gone by then.
export function SiteDock() {
  const shown = useDocked();
  const [active, setActive] = useState("top");

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
          <Dock className="items-end rounded-2xl border border-ink/15 bg-surface-solid/95 pb-2.5 shadow-[0_20px_50px_-15px_rgb(0_0_0/0.8),inset_0_1px_0_rgb(255_255_255/0.08)] light:shadow-[0_2px_4px_rgb(11_20_48/0.06),0_20px_44px_-14px_rgb(11_20_48/0.4)]">
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
            <DockItem onClick={switchTheme} aria-label="Switch between light and dark theme" className="aspect-square rounded-full bg-ink/[0.07] text-secondary transition-colors hover:text-fg">
              <DockLabel>Theme</DockLabel>
              <DockIcon>
                <Sun size="100%" className="light:hidden" />
                <Moon size="100%" className="hidden light:block" />
              </DockIcon>
            </DockItem>
          </Dock>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
