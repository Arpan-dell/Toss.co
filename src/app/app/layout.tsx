import type { Metadata } from "next";
import { Assistant } from "@/components/assistant";
import { PortalShell } from "@/components/portal-shell";
import { TelegramMiniApp } from "@/components/telegram-miniapp";
import { getCustomer } from "@/lib/data";
import { requireRole } from "@/lib/session";
import { CUSTOMER_NAV } from "./nav";

// Private portal: keep it out of search results.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CustomerLayout({ children }: LayoutProps<"/app">) {
  const session = await requireRole("CUSTOMER");
  const customer = await getCustomer(session.userId);
  return (
    <PortalShell subtitle={customer?.name ?? ""} nav={CUSTOMER_NAV}>
      {children}
      <TelegramMiniApp linked={Boolean(customer?.telegramId)} />
      <Assistant role="CUSTOMER" />
    </PortalShell>
  );
}
