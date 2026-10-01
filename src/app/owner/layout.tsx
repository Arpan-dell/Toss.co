import { PortalShell } from "@/components/portal-shell";
import { requireRole } from "@/lib/session";

const nav = [
  { href: "/owner", label: "Businesses" },
  { href: "/owner/payments", label: "Subscription payments" },
  { href: "/owner/settings", label: "Plan & UPI" },
];

export default async function OwnerLayout({ children }: LayoutProps<"/owner">) {
  const session = await requireRole("OWNER");
  return (
    <PortalShell badge="Owner" subtitle={session.email ?? ""} nav={nav}>
      {children}
    </PortalShell>
  );
}
