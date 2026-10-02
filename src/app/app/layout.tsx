import type { PortalNavItem } from "@/components/portal-dock";
import { PortalShell } from "@/components/portal-shell";
import { TelegramMiniApp } from "@/components/telegram-miniapp";
import { getCustomer } from "@/lib/data";
import { requireRole } from "@/lib/session";

const nav: PortalNavItem[] = [
  { href: "/app", label: "Overview", icon: "home" },
  { href: "/app/orders", label: "Order history", icon: "history" },
  { href: "/app/settings", label: "Settings", icon: "settings" },
];

export default async function CustomerLayout({ children }: LayoutProps<"/app">) {
  const session = await requireRole("CUSTOMER");
  const customer = await getCustomer(session.userId);
  return (
    <PortalShell subtitle={customer?.name ?? ""} nav={nav}>
      {children}
      <TelegramMiniApp linked={Boolean(customer?.telegramId)} />
    </PortalShell>
  );
}
