import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageTitle } from "@/components/ui";
import { UpiPay } from "@/components/upi-pay";
import { submitSubscriptionPayment } from "@/lib/actions/manager";
import { getPlatformSettings, getTenantById, listSubscriptionPayments } from "@/lib/data";
import { formatDate, formatDateTime, formatINR } from "@/lib/format";
import { planState } from "@/lib/plan";
import { subscriptionQuote } from "@/lib/pricing";
import { qrSvg } from "@/lib/qr";
import { requireRole } from "@/lib/session";
import { PlanCompare } from "./plan-compare";
import { buildUpiUri, isValidUpiId } from "@/lib/upi";

export const metadata: Metadata = { title: "Billing" };

const MONTH_OPTIONS = [1, 3, 6, 12];
const STATE_BADGE = {
  TRIAL: { tone: "info", label: "Free trial" },
  ACTIVE: { tone: "good", label: "Active" },
  EXPIRED: { tone: "neutral", label: "Free" },
  SUSPENDED: { tone: "critical", label: "Suspended" },
} as const;

export default async function Billing({ searchParams }: PageProps<"/admin/billing">) {
  const session = await requireRole("MANAGER");
  const [tenant, platform, params] = await Promise.all([getTenantById(session.tenantId), getPlatformSettings(), searchParams]);
  if (!tenant) return <Card>This manager account isn&apos;t linked to a business.</Card>;

  const history = await listSubscriptionPayments({ tenantId: tenant.id });
  const plan = planState(tenant);
  const months = MONTH_OPTIONS.includes(Number(params.months)) ? Number(params.months) : 1;
  const quote = (m: number) => subscriptionQuote(platform.monthlyPrice, platform, m);
  const { amount, pct, full, saved } = quote(months);
  const pending = history.find((p) => p.status === "PENDING");
  const canPay = isValidUpiId(platform.ownerUpiId) && amount > 0;

  const uri = canPay
    ? buildUpiUri({
        payeeUpiId: platform.ownerUpiId!,
        payeeName: platform.ownerUpiName,
        amount,
        note: `Toss ${months} month${months > 1 ? "s" : ""} ${tenant.joinCode}`,
        reference: `${tenant.joinCode}M${months}`,
      })
    : undefined;
  const qr = uri ? await qrSvg(uri) : undefined;
  const badge = STATE_BADGE[plan.state];

  return (
    <div className="stagger max-w-3xl space-y-6">
      <PageTitle kicker="Toss subscription">Billing</PageTitle>

      <Card title="Your plan" action={<Badge tone={badge.tone} icon="●">{badge.label}</Badge>}>
        <p className="text-sm text-secondary">
          {plan.state === "TRIAL" && `Free trial until ${formatDate(plan.until!)} (${plan.daysLeft} days left).`}
          {plan.state === "ACTIVE" && `Paid up until ${formatDate(plan.until!)} (${plan.daysLeft} days left).`}
          {plan.state === "EXPIRED" && "You're on Toss Free. Upgrade below to turn the Pro tools back on."}
          {plan.state === "SUSPENDED" && "Toss has suspended this business. Contact support."}{" "}
          The plan is <span className="text-fg">{formatINR(platform.monthlyPrice)}/month</span>. Paying early adds time on top of
          what you have left
          {platform.discount12m > 0 || platform.discount6m > 0 || platform.discount3m > 0
            ? `, and paying for several months at once is cheaper (up to ${Math.max(platform.discount3m, platform.discount6m, platform.discount12m)}% off).`
            : "."}
        </p>
      </Card>

      <PlanCompare current={plan.state === "EXPIRED" ? "FREE" : plan.state === "SUSPENDED" ? null : "PRO"} />

      {plan.state !== "SUSPENDED" && (
        <Card title={plan.state === "EXPIRED" ? "Upgrade to Pro" : "Pay for more months"}>
          {pending ? (
            <p className="rounded-[8px] border border-warn/30 bg-warn-bg px-3 py-2 text-sm text-warn">
              Your payment of {formatINR(pending.amount)} (ref {pending.paymentRef}) is waiting for Toss to confirm it.
            </p>
          ) : !canPay ? (
            <EmptyState>Online subscription payments aren&apos;t set up yet. Contact Toss.</EmptyState>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1 rounded-full border border-border bg-ink/[0.03] p-1 text-sm">
                {MONTH_OPTIONS.map((m) => (
                  <Link
                    key={m}
                    href={`/admin/billing?months=${m}`}
                    data-ripple
                    aria-current={m === months ? "page" : undefined}
                    className={`rounded-full px-3.5 py-1 ${m === months ? "bg-ink/10 font-medium text-fg" : "text-muted hover:text-fg"}`}
                  >
                    {m} month{m > 1 ? "s" : ""}
                    {quote(m).pct > 0 && <span className="ml-1.5 text-[11px] font-medium text-good">−{quote(m).pct}%</span>}
                  </Link>
                ))}
              </div>
              {pct > 0 && (
                <p className="rounded-[8px] border border-good/30 bg-good-bg px-3 py-2 text-sm text-good">
                  {pct}% off for paying {months} months at once: <s className="opacity-70">{formatINR(full)}</s>{" "}
                  <span className="font-semibold">{formatINR(amount)}</span>. You save {formatINR(saved)}.
                </p>
              )}
              <UpiPay
                key={months}
                uri={uri!}
                qrSvg={qr!}
                amountLabel={formatINR(amount)}
                payeeName={platform.ownerUpiName}
                payeeUpiId={platform.ownerUpiId!}
                action={submitSubscriptionPayment}
                hidden={{ months: String(months) }}
                startOpen
              />
            </div>
          )}
        </Card>
      )}

      <Card title="Payment history">
        {history.length === 0 ? (
          <EmptyState>No subscription payments yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {history.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span>
                  {formatINR(p.amount)} · {p.months} month{p.months > 1 ? "s" : ""}
                  <span className="ml-2 font-mono text-xs text-muted">{p.paymentRef}</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {formatDateTime(p.createdAt)}
                  <Badge tone={p.status === "APPROVED" ? "good" : p.status === "PENDING" ? "warn" : "critical"} icon="●">
                    {p.status === "APPROVED" ? "Confirmed" : p.status === "PENDING" ? "Waiting" : "Rejected"}
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
