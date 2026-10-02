import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageTitle, StatTile } from "@/components/ui";
import { setBusinessSuspended } from "@/lib/actions/owner";
import { getPlatformSettings, listSubscriptionPayments, listTenantStats, listTenants } from "@/lib/data";
import { formatDate, formatINR } from "@/lib/format";
import { planState, type PlanState } from "@/lib/plan";
import { requireRole } from "@/lib/session";
import { OptimisticForm } from "@/components/optimistic";
import { formatPhone } from "@/lib/phone";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Businesses" };

const BADGE: Record<PlanState, { tone: "good" | "info" | "critical"; label: string }> = {
  ACTIVE: { tone: "good", label: "Paid" },
  TRIAL: { tone: "info", label: "Trial" },
  EXPIRED: { tone: "critical", label: "Expired" },
  SUSPENDED: { tone: "critical", label: "Suspended" },
};

export default async function OwnerHome() {
  await requireRole("OWNER");
  const [tenants, platform, pending] = await Promise.all([
    listTenants(),
    getPlatformSettings(),
    listSubscriptionPayments({ status: "PENDING" }),
  ]);
  const stats = await listTenantStats(tenants);
  // "Get a Toss basket" requests from the website (server-only table; the owner sees them all)
  const { data: requests } = isSupabaseConfigured()
    ? await supabaseAdmin().from("basket_requests").select("id, name, phone, email, city, colour, quantity, message, created_at").order("created_at", { ascending: false }).limit(20)
    : { data: [] };
  const rows = tenants.map((t) => ({ t, plan: planState(t), s: stats.get(t.id) }));
  const paying = rows.filter((r) => r.plan.state === "ACTIVE").length;

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker="Toss platform">Businesses</PageTitle>

      {!platform.ownerUpiId && (
        <p role="alert" className="rounded-[8px] border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn">
          Add your UPI ID under <Link href="/owner/settings" className="underline">Plan &amp; UPI</Link> so businesses can pay
          their subscription.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Businesses" value={String(tenants.length)} />
        <StatTile label="Paying" value={String(paying)} />
        <StatTile label="Monthly revenue" value={formatINR(paying * platform.monthlyPrice)} hint="Paying × plan price" />
        <StatTile label="Payments to review" value={String(pending.length)} />
      </div>

      <Card title="All businesses">
        {rows.length === 0 ? (
          <EmptyState>No businesses yet. They appear here when someone registers one.</EmptyState>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] tracking-[0.12em] text-muted uppercase">
                  <th className="px-5 py-2 font-medium">Business</th>
                  <th className="px-3 py-2 font-medium">Manager</th>
                  <th className="px-3 py-2 text-right font-medium">Customers</th>
                  <th className="px-3 py-2 text-right font-medium">Orders</th>
                  <th className="px-3 py-2 font-medium">Plan</th>
                  <th className="px-5 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ t, plan, s }) => (
                  <tr key={t.id} className="border-b border-border transition-colors last:border-0 hover:bg-ink/[0.03]">
                    <td className="px-5 py-2.5">
                      <p className="font-medium">{t.name}</p>
                      <p className="font-mono text-xs text-muted">{t.joinCode}</p>
                      {t.closureRequestedAt && (
                        <p className="mt-1 text-xs text-warn" title={t.closureReason ?? undefined}>
                          Asked to be removed{t.closureReason ? `: “${t.closureReason}”` : ""}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-secondary">{s?.managerEmail ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{s?.customers ?? 0}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{s?.orders ?? 0}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={BADGE[plan.state].tone} icon="●">{BADGE[plan.state].label}</Badge>
                      {plan.until && <span className="ml-2 text-xs text-muted">until {formatDate(plan.until)}</span>}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <OptimisticForm action={setBusinessSuspended} done={plan.state === "SUSPENDED" ? "Reactivated" : "Suspended"}>
                        <input type="hidden" name="tenantId" value={t.id} />
                        <input type="hidden" name="suspend" value={plan.state === "SUSPENDED" ? "0" : "1"} />
                        <button className={`text-xs ${plan.state === "SUSPENDED" ? "text-good" : "text-critical"} hover:underline`}>
                          {plan.state === "SUSPENDED" ? "Reactivate" : "Suspend"}
                        </button>
                      </OptimisticForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Basket requests" action={requests?.length ? <Badge tone="info">{requests.length} recent</Badge> : undefined}>
        {!requests?.length ? (
          <EmptyState>No requests yet. They come from &quot;Get a Toss basket&quot; on the home page, and each one is emailed to you too.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {requests.map((r) => (
              <li key={r.id as number} className="flex flex-wrap items-start gap-x-6 gap-y-1 py-3 text-sm first:pt-0 last:pb-0">
                <div className="min-w-[200px] flex-1">
                  <p className="font-medium">
                    {r.name as string}
                    {r.city ? <span className="text-secondary"> · {r.city as string}</span> : null}
                  </p>
                  <p className="text-secondary">
                    {r.phone ? (
                      <a href={`tel:${r.phone as string}`} className="hover:underline">
                        {formatPhone(r.phone as string)}
                      </a>
                    ) : null}
                    {r.phone && r.email ? " · " : null}
                    {r.email ? (
                      <a href={`mailto:${r.email as string}`} className="hover:underline">
                        {r.email as string}
                      </a>
                    ) : null}
                  </p>
                  {r.message ? <p className="mt-1 text-xs text-muted italic">“{r.message as string}”</p> : null}
                </div>
                <p className="font-mono text-xs tabular-nums">
                  {r.quantity as number} × {r.colour as string}
                </p>
                <p className="w-24 text-right text-xs text-muted">{formatDate(r.created_at as string)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
