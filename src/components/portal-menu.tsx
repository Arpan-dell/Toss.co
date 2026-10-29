"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { List, SignOut, X } from "@phosphor-icons/react";
import { signOut } from "@/app/login/actions";
import { useT } from "./locale";
import { NAV_ICONS, isNavItemOn, type PortalNavItem } from "./portal-dock";

// Phones get this instead of the bottom dock: a menu button in the header that slides the navigation in from the
// right. A dock with a dozen icons is wider than a phone, so it covered the page and, on iPhones, made Safari
// shrink the whole page to fit it. A modal <dialog> brings focus trapping, Escape to close and an inert page
// behind it for free.
export function PortalMenu({ items, title }: { items: PortalNavItem[]; title?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const t = useT();
  const close = () => ref.current?.close();

  // close after navigating (also covers the browser's back button)
  useEffect(() => {
    ref.current?.close();
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        aria-label={t("Open menu")}
        aria-haspopup="dialog"
        className="btn-ghost grid size-9 place-items-center rounded-full text-fg md:hidden"
      >
        <List size={20} weight="bold" aria-hidden />
      </button>
      <dialog
        ref={ref}
        aria-label={t("Menu")}
        // a click on the dimmed backdrop lands on the <dialog> itself; clicks inside the panel land on its children
        onClick={(e) => e.target === e.currentTarget && close()}
        className="portal-menu m-0 ml-auto h-dvh max-h-dvh w-[min(20rem,86vw)] max-w-none border-l border-border bg-surface-solid p-0 text-fg backdrop:bg-black/50 backdrop:backdrop-blur-[2px] md:hidden"
      >
        <div className="flex h-full flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <p className="min-w-0 truncate text-sm text-secondary">{title || t("Menu")}</p>
            <button type="button" onClick={close} aria-label={t("Close menu")} className="btn-ghost grid size-9 shrink-0 place-items-center rounded-full">
              <X size={18} weight="bold" aria-hidden />
            </button>
          </div>
          <nav data-nav aria-label={t("Dashboard")} className="flex-1 overflow-y-auto px-3 py-3">
            <ul className="space-y-1">
              {items.map((item) => {
                const on = isNavItemOn(item, items, pathname);
                const Glyph = NAV_ICONS[item.icon];
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={close}
                      aria-current={on ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors ${
                        on ? "bg-accent/15 font-medium text-accent" : "text-secondary hover:bg-ink/[0.06] hover:text-fg"
                      }`}
                    >
                      <span className={`grid size-9 shrink-0 place-items-center rounded-full ${on ? "bg-accent/15" : "bg-ink/[0.07]"}`}>
                        <Glyph size={19} weight={on ? "fill" : "regular"} aria-hidden />
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <form action={signOut} className="border-t border-border px-3 py-3">
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] text-secondary hover:bg-ink/[0.06] hover:text-fg">
              <span className="grid size-9 place-items-center rounded-full bg-ink/[0.07]">
                <SignOut size={19} aria-hidden />
              </span>
              {t("Sign out")}
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
