import { PortalShell } from "@/components/portal-shell";
import { TelegramMiniApp } from "@/components/telegram-miniapp";
import { getCustomer } from "@/lib/data";
import { requireRole } from "@/lib/session";

const nav = [
  { href: "/app", label: "Overview" },
  { href: "/app/orders", label: "Order history" },
  { href: "/app/settings", label: "Settings" },
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
