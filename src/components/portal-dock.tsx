"use client";

import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Briefcase,
  Broadcast,
  Buildings,
  Coins,
  Drop,
  Gift,
  Star,
  TreeStructure,
  Wallet,
  ChartLineUp,
  ClockCounterClockwise,
  CreditCard,
  CurrencyInr,
  GearSix,
  House,
  MapPinArea,
  Package,
  Receipt,
  Sliders,
  Sparkle,
  Storefront,
  Truck,
  UsersThree,
  type Icon,
} from "@phosphor-icons/react";
import { Dock, DockIcon, DockItem, DockLabel } from "@/components/core/dock";

// Layouts are Server Components and can't pass icon components across, so nav items name their icon.
const ICONS = {
  live: Broadcast,
  ai: Sparkle,
  payments: CurrencyInr,
  customers: UsersThree,
  fleet: Truck,
  orders: Package,
  analytics: ChartLineUp,
  business: Storefront,
  billing: Receipt,
  home: House,
  history: ClockCounterClockwise,
  settings: GearSix,
  businesses: Buildings,
  subscriptions: CreditCard,
  plan: Sliders,
  find: MapPinArea,
  credits: Gift,
  stock: Drop,
  profit: Coins,
  accounts: Briefcase,
  branches: TreeStructure,
  driverpay: Wallet,
  ratings: Star,
} satisfies Record<string, Icon>;

// match: other pages that belong under this item (e.g. Settings is lit on every settings page)
export type PortalNavItem = { href: string; label: string; icon: keyof typeof ICONS; match?: string[] };

// The dashboards' main navigation, as a magnifying dock pinned to the bottom of the screen.
export function PortalDock({ items }: { items: PortalNavItem[] }) {
  const pathname = usePathname();
  const router = useRouter();
  // The portal root (/app, /admin) only matches exactly; sub-pages match by prefix.
  const rootHref = items[0]?.href;
  return (
    <nav aria-label="Dashboard" className="fixed bottom-3 left-1/2 z-40 max-w-full -translate-x-1/2">
      <Dock className="items-end rounded-2xl border border-ink/15 bg-surface-solid/95 pb-2.5 shadow-[0_20px_50px_-15px_rgb(0_0_0/0.8),inset_0_1px_0_rgb(255_255_255/0.08)] light:shadow-[0_2px_4px_rgb(11_20_48/0.06),0_20px_44px_-14px_rgb(11_20_48/0.4)]">
        {items.map((item) => {
          const on =
            item.href === rootHref ? pathname === item.href : pathname.startsWith(item.href) || !!item.match?.some((m) => pathname.startsWith(m));
          const Glyph = ICONS[item.icon];
          return (
            <DockItem
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={on ? "page" : undefined}
              // hovering or focusing an icon fully prefetches that page, so the click is instant
              onIntent={() => router.prefetch(item.href)}
              className={`aspect-square rounded-full transition-colors ${on ? "bg-accent/15 text-accent" : "bg-ink/[0.07] text-secondary hover:text-fg"}`}
            >
              <DockLabel>{item.label}</DockLabel>
              <DockIcon>
                <Glyph size="100%" weight={on ? "fill" : "regular"} />
              </DockIcon>
              {on && <motion.span layoutId="portal-dock-dot" className="absolute -bottom-2 size-1 rounded-full bg-accent" />}
            </DockItem>
          );
        })}
      </Dock>
    </nav>
  );
}
