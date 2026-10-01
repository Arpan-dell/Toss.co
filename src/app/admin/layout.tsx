import Link from "next/link";
import { LiveRefresh } from "@/components/live-refresh";
import { PortalShell } from "@/components/portal-shell";
import { getTenantById } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { planState } from "@/lib/plan";
import { requireRole } from "@/lib/session";

const nav = [
  { href: "/admin", label: "Live board" },
  { href: "/admin/ai", label: "✨ Toss AI" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/fleet", label: "Fleet" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/business", label: "Business" },
  { href: "/admin/billing", label: "Billing" },
];

export default async function ManagerLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireRole("MANAGER");
  const tenant = await getTenantById(session.tenantId);
  const plan = tenant ? planState(tenant) : undefined;

  return (
    <PortalShell badge="Manager" subtitle={tenant?.name ?? ""} nav={nav}>
      {tenant && (
        <div className="mb-4 flex justify-end">
          <LiveRefresh tenantId={tenant.id} />
        </div>
      )}
      {plan && plan.state !== "ACTIVE" && (
        <div
          role="status"
          className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${
            plan.state === "TRIAL" ? "border-accent/30 bg-accent/[0.07] text-secondary" : "border-critical/30 bg-critical-bg text-critical"
          }`}
        >
          <span>
            {plan.state === "TRIAL" &&
              `Free trial: ${plan.daysLeft} day${plan.daysLeft === 1 ? "" : "s"} left (until ${formatDate(plan.until!)}).`}
            {plan.state === "EXPIRED" && "Your Toss subscription has expired. Renew to keep using the dashboard."}
            {plan.state === "SUSPENDED" && "This business has been suspended by Toss. Contact support."}
          </span>
          {plan.state !== "SUSPENDED" && (
            <Link href="/admin/billing" className="btn-ghost rounded-full px-3.5 py-1 text-xs text-fg">
              {plan.state === "TRIAL" ? "Subscribe" : "Renew now"} →
            </Link>
          )}
        </div>
      )}
      {children}
    </PortalShell>
  );
}
