import type { Metadata } from "next";
import { ConfirmButton } from "@/components/confirm-button";
import { planGate } from "@/components/plan-gate";
import { Badge, Card, EmptyState, PageTitle, StatTile } from "@/components/ui";
import { removeCustomer } from "@/lib/actions/manager-ops";
import { listCustomers, listDevices, listOrders, now } from "@/lib/data";
import { formatINR, timeAgo } from "@/lib/format";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Customers" };

export default async function Customers({ searchParams }: PageProps<"/admin/customers">) {
  const locked = await planGate();
  if (locked) return locked;
  const session = await requireRole("MANAGER");

  const [customers, orders, devices, params] = await Promise.all([listCustomers(), listOrders(), listDevices(), searchParams]);
  const q = typeof params.q === "string" ? params.q.trim().toLowerCase() : "";
  const current = now();

  const rows = customers
    .filter((c) => c.tenantId === session.tenantId)
    .map((c) => {
      const mine = orders.filter((o) => o.customerId === c.id);
      return {
        c,
        orders: mine.length,
        owed: mine.filter((o) => o.status === "COMPLETED" && o.paymentStatus !== "PAID").reduce((s, o) => s + o.amountDue, 0),
        spent: mine.filter((o) => o.paymentStatus === "PAID").reduce((s, o) => s + o.amountDue, 0),
        lastOrder: mine[0]?.createdAt,
        baskets: devices.filter((d) => d.customerId === c.id).length,
      };
    })
    .filter(
      ({ c }) =>
        !q ||
        [c.name, c.email, c.customerCode, c.telegramId].some((v) => v?.toLowerCase().includes(q)),
    )
    .sort((a, b) => (b.lastOrder ?? "").localeCompare(a.lastOrder ?? ""));

  const all = customers.filter((c) => c.tenantId === session.tenantId);
  const totalOwed = rows.reduce((s, r) => s + r.owed, 0);

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker="People">Customers</PageTitle>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatTile label="Customers" value={String(all.length)} />
        <StatTile label="Telegram linked" value={`${all.filter((c) => c.telegramId).length} / ${all.length}`} hint="Needed to see their basket's orders" />
        <StatTile label="Owed to you" value={formatINR(totalOwed)} />
      </div>

      <Card
        title={`${rows.length} customer${rows.length === 1 ? "" : "s"}`}
        action={
          <form className="w-56">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search name, ID, email…"
              className="w-full rounded-full border border-border bg-white/[0.03] px-4 py-1.5 text-sm placeholder:text-muted focus:border-accent/60 focus:outline-none"
            />
          </form>
        }
      >
        {rows.length === 0 ? (
          <EmptyState>
            {q ? "No customers match that search." : "No customers yet. Share your Business ID (on the Business page) so they can connect."}
          </EmptyState>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] tracking-[0.12em] text-muted uppercase">
                  <th className="px-5 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Telegram</th>
                  <th className="px-3 py-2 text-right font-medium">Baskets</th>
                  <th className="px-3 py-2 text-right font-medium">Orders</th>
                  <th className="px-3 py-2 text-right font-medium">Paid</th>
                  <th className="px-3 py-2 text-right font-medium">Owes</th>
                  <th className="px-3 py-2 font-medium">Last order</th>
                  <th className="px-5 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, orders: n, owed, spent, lastOrder, baskets }) => (
                  <tr key={c.id} data-reveal="row" className="border-b border-border transition-colors last:border-0 hover:bg-white/[0.03]">
                    <td className="px-5 py-2.5">
                      <p className="font-medium">{c.name ?? c.email ?? "—"}</p>
                      <p className="font-mono text-xs text-muted">{c.customerCode}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      {c.telegramId ? <Badge tone="good" icon="✓">Linked</Badge> : <Badge tone="warn" icon="!">Not linked</Badge>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{baskets}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{n}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(spent)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${owed ? "text-critical" : "text-muted"}`}>{formatINR(owed)}</td>
                    <td className="px-3 py-2.5 text-secondary">{lastOrder ? timeAgo(lastOrder, current) : "—"}</td>
                    <td className="px-5 py-2.5 text-right">
                      <ConfirmButton
                        action={removeCustomer}
                        fields={{ customerId: c.id }}
                        label="Remove"
                        confirm={`Remove ${c.name ?? "this customer"} from your business? Their past orders stay in your history; new orders from their basket won't come to you.`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
