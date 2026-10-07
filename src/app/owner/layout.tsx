import type { Metadata } from "next";
import type { PortalNavItem } from "@/components/portal-dock";
import { PortalShell } from "@/components/portal-shell";
import { requireRole } from "@/lib/session";

// Private portal: keep it out of search results.
export const metadata: Metadata = { robots: { index: false, follow: false } };

const nav: PortalNavItem[] = [
  { href: "/owner", label: "Businesses", icon: "businesses" },
  { href: "/owner/payments", label: "Subscription payments", icon: "subscriptions" },
  { href: "/owner/credits", label: "Basket credits", icon: "credits" },
  { href: "/owner/settings", label: "Plan & UPI", icon: "plan" },
];

export default async function OwnerLayout({ children }: LayoutProps<"/owner">) {
  const session = await requireRole("OWNER");
  return (
    <PortalShell badge="Owner" subtitle={session.email ?? ""} nav={nav}>
      {children}
    </PortalShell>
  );
}
