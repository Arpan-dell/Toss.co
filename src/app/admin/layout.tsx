import type { Metadata } from "next";
import Link from "next/link";
import { LiveRefresh } from "@/components/live-refresh";
import type { PortalNavItem } from "@/components/portal-dock";
import { PortalShell } from "@/components/portal-shell";
import { getTenantById } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { planState } from "@/lib/plan";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

// Private portal: keep it out of search results.
export const metadata: Metadata = { robots: { index: false, follow: false } };

const nav: PortalNavItem[] = [
  { href: "/admin", label: "Live board", icon: "live" },
  { href: "/admin/ai", label: "Toss AI", icon: "ai" },
  { href: "/admin/payments", label: "Payments", icon: "payments" },
  { href: "/admin/customers", label: "Customers", icon: "customers" },
  { href: "/admin/fleet", label: "Fleet", icon: "fleet" },
  { href: "/admin/orders", label: "Orders", icon: "orders" },
  { href: "/admin/analytics", label: "Analytics", icon: "analytics" },
  { href: "/admin/profit", label: "Profit", icon: "profit" },
  { href: "/admin/stock", label: "Supplies", icon: "stock" },
  { href: "/admin/business", label: "Business", icon: "business" },
  { href: "/admin/billing", label: "Billing", icon: "billing" },
];

export default async function ManagerLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireRole("MANAGER");
  const tenant = await getTenantById(session.tenantId);
  const plan = tenant ? planState(tenant) : undefined;
  // short-lived access token for the live board's realtime subscription (session cookies are HttpOnly)
  const token = (await (await createClient()).auth.getSession()).data.session?.access_token;

  return (
    <PortalShell badge="Manager" subtitle={tenant?.name ?? ""} nav={nav}>
      {tenant && (
        <div className="mb-4 flex justify-end">
          {token && <LiveRefresh tenantId={tenant.id} token={token} />}
        </div>
      )}
      {plan && plan.state !== "ACTIVE" && (
        <div
          role="status"
          className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border px-4 py-3 text-sm ${
            plan.state === "SUSPENDED" ? "border-critical/30 bg-critical-bg text-critical" : "border-accent/30 bg-accent/[0.07] text-secondary"
          }`}
        >
          <span>
            {plan.state === "TRIAL" &&
              `Free trial: ${plan.daysLeft} day${plan.daysLeft === 1 ? "" : "s"} left (until ${formatDate(plan.until!)}).`}
            {plan.state === "EXPIRED" && "You're on Toss Free: pickups, payments and orders keep working. Pro adds auto-tools, Toss AI, analytics and more."}
            {plan.state === "SUSPENDED" && "This business has been suspended by Toss. Contact support."}
          </span>
          {plan.state !== "SUSPENDED" && (
            <Link href="/admin/billing" className="btn-ghost rounded-full px-3.5 py-1 text-xs text-fg">
              {plan.state === "TRIAL" ? "Subscribe" : "Upgrade to Pro"} →
            </Link>
          )}
        </div>
      )}
      {children}
    </PortalShell>
  );
}
