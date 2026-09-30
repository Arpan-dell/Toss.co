import { PortalShell } from "@/components/portal-shell";
import { getTenant } from "@/lib/data";
import { requireRole } from "@/lib/session";

const nav = [
  { href: "/admin", label: "Live board" },
  { href: "/admin/fleet", label: "Fleet" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/analytics", label: "Analytics" },
];

export default async function ManagerLayout({ children }: LayoutProps<"/admin">) {
  await requireRole("MANAGER");
  const tenant = await getTenant();
  return (
    <PortalShell badge="Manager" subtitle={tenant.name} nav={nav}>
      {children}
    </PortalShell>
  );
}
