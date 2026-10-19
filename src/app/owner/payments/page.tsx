import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageTitle, StatTile } from "@/components/ui";
import { reviewSubscriptionPayment } from "@/lib/actions/owner";
import { listSubscriptionPayments, listTenants } from "@/lib/data";
import { formatDate, formatDateTime } from "@/lib/format";
import { fromMinor } from "@/lib/gateways";
import { moneyIn } from "@/lib/region-format";
import { requireRole } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { OptimisticForm, OptimisticRow } from "@/components/optimistic";

export const metadata: Metadata = { title: "Subscription payments" };

// How a plan payment arrived, from its reference: Razorpay payment ids start "pay_", Stripe invoices "in_".
// Anything else is an older payment someone typed a UPI reference for.
function via(ref: string): { label: string; tone: "good" | "info" | "neutral" } {
  if (/^PAY/.test(ref)) return { label: "Razorpay", tone: "good" };
  if (/^IN[A-Z0-9]/.test(ref) && ref.length > 20) return { label: "Stripe", tone: "good" };
  return { label: "UPI (manual)", tone: "neutral" };
}

const RENEW: Record<string, { label: string; tone: "good" | "warn" | "critical" | "neutral" }> = {
  active: { label: "On", tone: "good" },
  created: { label: "Not approved yet", tone: "warn" },
  failing: { label: "Payment failing", tone: "critical" },
  cancelled: { label: "Turned off", tone: "neutral" },
};

export default async function OwnerPayments() {
  await requireRole("OWNER");
  const admin = supabaseAdmin();
  const [payments, tenants, gateways, renewals] = await Promise.all([
    listSubscriptionPayments(),
    listTenants(),
    admin.from("platform_gateways").select("currency_group, provider, live, webhook_secret_enc, last_event_at").then((r) => r.data ?? []),
    // automatic renewals arrive with migration 0039
    admin.from("plan_autorenew").select("tenant_id, provider, currency, amount_minor, status, last_charged_at, updated_at").order("updated_at", { ascending: false }).then((r) => (r.error ? null : (r.data ?? []))),
  ]);
  const name = new Map(tenants.map((t) => [t.id, `${t.name} · ${t.joinCode}`]));
  const pending = payments.filter((p) => p.status === "PENDING");
  const reviewed = payments.filter((p) => p.status !== "PENDING");

  // money in this calendar month, per currency
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const thisMonth = reviewed.filter((p) => p.status === "APPROVED" && new Date(p.createdAt) >= monthStart);
  const totals = new Map<string, number>();
  for (const p of thisMonth) totals.set(p.currency, (totals.get(p.currency) ?? 0) + p.amount);
  const totalText = totals.size ? [...totals].map(([c, a]) => moneyIn(a, c)).join(" + ") : moneyIn(0, "INR");
  const activeRenewals = (renewals ?? []).filter((r) => r.status === "active").length;

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker="Money in">Subscription payments</PageTitle>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <StatTile label="Received this month" value={totalText} hint={`${thisMonth.length} payment${thisMonth.length === 1 ? "" : "s"}`} />
        <StatTile label="Auto-renewing" value={String(activeRenewals)} hint={renewals ? "businesses paying monthly by themselves" : "after the 0039 database update"} />
        <StatTile label="To check by hand" value={String(pending.length)} hint="older UPI payments only" />
      </div>

      <Card title="Payment gateways" action={<Link href="/owner/settings" className="text-sm text-accent hover:text-accent-2">Settings →</Link>}>
        <ul className="divide-y divide-border text-sm">
          {(["INR", "USD"] as const).map((group) => {
            const g = gateways.find((x) => x.currency_group === group);
            return (
              <li key={group} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span>
                  {group === "INR" ? "Rupees (India)" : "US dollars (abroad)"}
                  <span className="ml-2 text-secondary">{g ? `${g.provider === "razorpay" ? "Razorpay" : "Stripe"} · ${g.live ? "live" : "test mode"}` : "not connected"}</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {g?.last_event_at && <span>last confirmation {formatDateTime(g.last_event_at as string)}</span>}
                  {!g ? (
                    <Badge tone="neutral">Off</Badge>
                  ) : g.provider === "razorpay" && !g.webhook_secret_enc ? (
                    <Badge tone="warn">Webhook missing</Badge>
                  ) : (
                    <Badge tone="good">Confirms automatically</Badge>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-xs text-muted">
          Businesses pay on the gateway; it tells Toss, and the plan extends by itself. Nothing for you to approve.
        </p>
      </Card>

      <Card title="Automatic renewals" action={activeRenewals ? <Badge tone="good">{activeRenewals} on</Badge> : undefined}>
        {renewals === null ? (
          <EmptyState>Run the 0039 database update (Supabase → SQL Editor) to switch on automatic renewals.</EmptyState>
        ) : renewals.length === 0 ? (
          <EmptyState>No business has turned on automatic renewal yet. They can under Billing → Renew automatically.</EmptyState>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {renewals.map((r) => {
              const s = RENEW[r.status as string] ?? RENEW.cancelled;
              return (
                <li key={r.tenant_id as string} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span>
                    {name.get(r.tenant_id as string) ?? (r.tenant_id as string)}
                    <span className="ml-2 text-secondary">
                      {moneyIn(fromMinor(r.amount_minor as number, r.currency as string), r.currency as string)}/month · {r.provider === "razorpay" ? "Razorpay" : "Stripe"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {r.last_charged_at ? `last charged ${formatDate(r.last_charged_at as string)}` : `since ${formatDate(r.updated_at as string)}`}
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {pending.length > 0 && (
        <Card title="Check these in your UPI app" action={<Badge tone="warn" live>{pending.length} waiting</Badge>}>
          <ul className="divide-y divide-border">
            {pending.map((p) => (
              <OptimisticRow key={p.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-[240px] flex-1 text-sm">
                  <p className="font-medium">
                    {moneyIn(p.amount, p.currency)} for {p.months} month{p.months > 1 ? "s" : ""}
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
          <p className="mt-4 text-xs text-muted">Older payments made by typing a UPI reference. Approving extends that business&apos;s plan by the months they paid for.</p>
        </Card>
      )}

      <Card title="History">
        {reviewed.length === 0 ? (
          <EmptyState>No payments yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {reviewed.map((p) => {
              const how = via(p.paymentRef);
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span>
                    {moneyIn(p.amount, p.currency)} · {p.months} mo · <span className="text-secondary">{name.get(p.tenantId) ?? p.tenantId}</span>
                    <span className="ml-2 text-xs text-muted">{formatDateTime(p.createdAt)}</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    <span className="font-mono">{p.paymentRef}</span>
                    <Badge tone={how.tone}>{how.label}</Badge>
                    <Badge tone={p.status === "APPROVED" ? "good" : "critical"}>{p.status === "APPROVED" ? "Paid" : "Rejected"}</Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
