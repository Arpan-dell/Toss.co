import type { PortalNavItem } from "@/components/portal-dock";
import { PortalShell } from "@/components/portal-shell";
import { requireRole } from "@/lib/session";

const nav: PortalNavItem[] = [
  { href: "/owner", label: "Businesses", icon: "businesses" },
  { href: "/owner/payments", label: "Subscription payments", icon: "subscriptions" },
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
