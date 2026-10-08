import type { Metadata } from "next";
import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";
import {
  Briefcase,
  ChartLineUp,
  CurrencyInr,
  Gift,
  LockSimple,
  Receipt,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Storefront,
  TreeStructure,
} from "@phosphor-icons/react/dist/ssr";
import { currentTier } from "@/components/plan-gate";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Settings" };

// locked: needs the account password to change
type Tile = { href: string; title: string; text: string; icon: Icon; pro?: boolean; locked?: boolean };

const GROUPS: { title: string; tiles: Tile[] }[] = [
  {
    title: "Your laundry",
    tiles: [
      { href: "/admin/business", title: "Business", text: "Name, Business ID, store address and the area you pick up from.", icon: Storefront },
      { href: "/admin/settings/payments", title: "Price & UPI", text: "Your price per kg and the UPI ID customers pay to.", icon: CurrencyInr, locked: true },
      {
        href: "/admin/settings/operations",
        title: "How you work",
        text: "Weighing at pickup, whites and coloured, delivery back, and your turnaround.",
        icon: SlidersHorizontal,
      },
    ],
  },
  {
    title: "Account",
    tiles: [
      { href: "/admin/settings/account", title: "Account & security", text: "Change your password, or close the business.", icon: ShieldCheck },
      { href: "/admin/billing", title: "Plan & billing", text: "Your Toss plan, what Pro adds, and paying for it.", icon: Receipt },
    ],
  },
  {
    title: "Grow",
    tiles: [
      { href: "/admin/accounts", title: "Business accounts", text: "PGs, hostels and offices with many baskets, billed once a month.", icon: Briefcase, pro: true },
      { href: "/admin/branches", title: "Branches", text: "Run more than one laundry from one login.", icon: TreeStructure, pro: true },
      { href: "/admin/ratings", title: "Ratings", text: "What customers think of each pickup, and who to call back.", icon: Star, pro: true },
      { href: "/admin/analytics", title: "Analytics", text: "Busy days, best customers and what's coming next week.", icon: ChartLineUp, pro: true },
      { href: "/admin/settings/winback", title: "Win-back offers", text: "An automatic discount that brings quiet customers back.", icon: Gift, pro: true },
    ],
  },
];

// Settings: everything a manager sets up once or checks now and then, out of the everyday dock.
export default async function Settings() {
  const tier = await currentTier();
  const pro = tier?.tier === "PRO";

  return (
    <div className="stagger max-w-4xl space-y-8">
      <PageTitle kicker="Set up once, check now and then">Settings</PageTitle>
      {GROUPS.map((g) => (
        <section key={g.title} className="space-y-3">
          <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">{g.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {g.tiles.map((t) => {
              const locked = t.pro && !pro;
              const Glyph = t.icon;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className="group flex gap-4 rounded-[10px] border border-border bg-surface-solid p-4 transition-colors hover:border-accent/50"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
                    <Glyph size={20} weight="duotone" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-medium text-fg">
                      {t.title}
                      {t.locked && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warn-bg px-1.5 py-0.5 font-mono text-[10px] text-warn" title="Changes need your password">
                          <LockSimple size={10} weight="bold" aria-hidden />
                          PASSWORD
                        </span>
                      )}
                      {t.pro && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] ${locked ? "bg-warn-bg text-warn" : "bg-accent/10 text-accent"}`}>
                          {locked && <LockSimple size={10} weight="bold" aria-hidden />}PRO
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-sm text-secondary">{t.text}</span>
                  </span>
                  <span aria-hidden className="self-center text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent">
                    →
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
