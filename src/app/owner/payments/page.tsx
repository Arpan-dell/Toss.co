import type { Metadata } from "next";
import { Badge, Card, EmptyState, PageTitle } from "@/components/ui";
import { reviewSubscriptionPayment } from "@/lib/actions/owner";
import { listSubscriptionPayments, listTenants } from "@/lib/data";
import { formatDateTime, formatINR } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { OptimisticForm, OptimisticRow } from "@/components/optimistic";

export const metadata: Metadata = { title: "Subscription payments" };

export default async function OwnerPayments() {
  await requireRole("OWNER");
  const [payments, tenants] = await Promise.all([listSubscriptionPayments(), listTenants()]);
  const name = new Map(tenants.map((t) => [t.id, `${t.name} · ${t.joinCode}`]));
  const pending = payments.filter((p) => p.status === "PENDING");
  const reviewed = payments.filter((p) => p.status !== "PENDING");

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker="Money in">Subscription payments</PageTitle>

      <Card title="Check these in your UPI app" action={pending.length ? <Badge tone="warn" live>{pending.length} waiting</Badge> : undefined}>
        {pending.length === 0 ? (
          <EmptyState>Nothing to review.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((p) => (
              <OptimisticRow key={p.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-[240px] flex-1 text-sm">
                  <p className="font-medium">
                    {formatINR(p.amount)} for {p.months} month{p.months > 1 ? "s" : ""}
                  </p>
                  <p className="text-secondary">{name.get(p.tenantId) ?? p.tenantId}</p>
                  <p className="text-xs text-muted">
                    UPI ref <span className="font-mono text-fg">{p.paymentRef}</span> · {formatDateTime(p.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <OptimisticForm action={reviewSubscriptionPayment} hide>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="decision" value="approve" />
                    <button className="btn-primary rounded-full px-4 py-1.5 text-sm font-medium">Received</button>
                  </OptimisticForm>
                  <OptimisticForm action={reviewSubscriptionPayment} hide>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <button className="btn-ghost rounded-full px-4 py-1.5 text-sm text-critical">Not received</button>
                  </OptimisticForm>
                </div>
              </OptimisticRow>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-muted">Approving extends that business&apos;s plan by the months they paid for.</p>
      </Card>

      <Card title="History">
        {reviewed.length === 0 ? (
          <EmptyState>No reviewed payments yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {reviewed.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span>
                  {formatINR(p.amount)} · {p.months} mo · <span className="text-secondary">{name.get(p.tenantId) ?? p.tenantId}</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  <span className="font-mono">{p.paymentRef}</span>
                  <Badge tone={p.status === "APPROVED" ? "good" : "critical"} icon="●">
                    {p.status === "APPROVED" ? "Approved" : "Rejected"}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
