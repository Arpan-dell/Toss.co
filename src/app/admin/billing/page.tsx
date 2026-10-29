import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageTitle } from "@/components/ui";
import { GatewayPay } from "@/components/gateway-pay";
import { paySubscriptionOnline, savePayerPhone, startPlanRenewal, stopPlanRenewal } from "@/lib/actions/gateway";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { payerPhone } from "@/lib/payer";
import { getRenewal, platformGatewayName, refreshIntent } from "@/lib/gateway-payments";
import { getPlatformSettings, getTenantById, getTenantCreditBalance, listSubscriptionPayments, now } from "@/lib/data";
import { myFormat } from "@/lib/my-format";
import { moneyIn, subscriptionFormat } from "@/lib/region-format";
import { planState } from "@/lib/plan";
import { subscriptionQuote, withBasketCredit } from "@/lib/pricing";
import { requireRole } from "@/lib/session";
import { PlanCompare } from "./plan-compare";
import { AutoRenew } from "./auto-renew";

export const metadata: Metadata = { title: "My plan" };

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

  const [history, creditBalance] = await Promise.all([listSubscriptionPayments({ tenantId: tenant.id }), getTenantCreditBalance(tenant.id)]);
  const plan = planState(tenant);
  const fmt = await myFormat();
  // Indian businesses pay in rupees; everyone else in US dollars
  const sub = subscriptionFormat(tenant);
  const usd = sub.region.currency === "USD";
  const months = MONTH_OPTIONS.includes(Number(params.months)) ? Number(params.months) : 1;
  // an extra branch pays the branch price (same rule as submit_subscription_payment)
  const monthly = usd
    ? tenant.parentTenantId ? platform.usdBranchPrice : platform.usdMonthlyPrice
    : tenant.parentTenantId ? platform.branchPrice : platform.monthlyPrice;
  const quote = (m: number) => subscriptionQuote(monthly, platform, m, sub.region.currency);
  const { amount: beforeCredit, pct, full, saved } = quote(months);
  // Toss's share of the basket credit this laundry has honoured comes off the payment (same rule as the database);
  // basket credit is in rupees, so only Indian businesses have any
  const { credit, toPay: amount } = usd ? { credit: 0, toPay: beforeCredit } : withBasketCredit(beforeCredit, creditBalance, platform.creditSubMaxPct);
  const pending = history.find((p) => p.status === "PENDING");
  // Paid on Toss's own gateway (Razorpay for rupees, Stripe for dollars): the gateway confirms the payment to Toss
  // and the plan extends by itself. No UPI references to type, nothing for Toss to approve by hand.
  const online = amount > 0 ? await platformGatewayName(sub.region.currency) : null;
  const canPay = amount > 0 && !!online;
  // back from the gateway: what it confirmed (never what the URL says)
  const back = typeof params.intent === "string" ? await refreshIntent(params.intent, { tenantId: tenant.id }) : null;
  const badge = STATE_BADGE[plan.state];
  // a payment always adds on top: from the end of the trial or the paid time, or from today if that's passed
  const runningUntil = (plan.state === "TRIAL" || plan.state === "ACTIVE") && plan.until ? new Date(plan.until) : null;
  const extendedTo = new Date(Math.max(now().getTime(), runningUntil?.getTime() ?? 0));
  extendedTo.setMonth(extendedTo.getMonth() + months);
  // the payment page pre-fills this number; ask once if Toss doesn't know one
  const phoneKnown = !!(await payerPhone(session.userId, tenant.country));
  // renew automatically every month at the one-month price (needs Toss's gateway, like paying by hand)
  const renewGateway = online ?? (await platformGatewayName(sub.region.currency));
  const renewal = renewGateway ? await getRenewal(tenant.id).catch(() => null) : null;

  return (
    <div className="stagger mx-auto w-full max-w-3xl space-y-6">
      <PageTitle kicker="Toss subscription">My plan</PageTitle>

      <Card title="Your plan" action={<Badge tone={badge.tone} icon="●">{badge.label}</Badge>}>
        <p className="text-sm text-secondary">
          {plan.state === "TRIAL" && `Free trial until ${fmt.date(plan.until!)} (${plan.daysLeft} days left).`}
          {plan.state === "ACTIVE" && `Paid up until ${fmt.date(plan.until!)} (${plan.daysLeft} days left).`}
          {plan.state === "EXPIRED" && "You're on Toss Free. Upgrade below to turn the Pro tools back on."}
          {plan.state === "SUSPENDED" && "Toss has suspended this business. Contact support."}{" "}
          The plan is <span className="text-fg">{sub.money(monthly)}/month</span>
          {tenant.parentTenantId ? " (branch price)" : ""}. Paying early adds time on top of
          what you have left
          {platform.discount12m > 0 || platform.discount6m > 0 || platform.discount3m > 0
            ? `, and paying for several months at once is cheaper (up to ${Math.max(platform.discount3m, platform.discount6m, platform.discount12m)}% off).`
            : "."}
        </p>
      </Card>

      <PlanCompare current={plan.state === "EXPIRED" ? "FREE" : plan.state === "SUSPENDED" ? null : "PRO"} />

      {back && (
        <p
          role="status"
          className={`rounded-[8px] border px-4 py-3 text-sm ${back.status === "paid" ? "border-good/30 bg-good-bg text-good" : back.status === "created" ? "border-warn/30 bg-warn-bg text-warn" : "border-critical/30 bg-critical-bg text-critical"}`}
        >
          {back.status === "paid"
            ? "Payment received. Your plan is extended and a receipt is on its way."
            : back.status === "created"
              ? "Waiting for the payment gateway to confirm your payment. Refresh in a moment; your plan extends as soon as it does."
              : "That payment didn't go through, and you haven't been charged."}
        </p>
      )}

      {plan.state !== "SUSPENDED" && (
        <Card title={plan.state === "EXPIRED" ? "Upgrade to Pro" : "Pay for more months"}>
          {pending ? (
            <p className="rounded-[8px] border border-warn/30 bg-warn-bg px-3 py-2 text-sm text-warn">
              Your payment of {moneyIn(pending.amount, pending.currency)} (ref {pending.paymentRef}) is waiting for Toss to confirm it.
            </p>
          ) : !canPay ? (
            <EmptyState>Online payment for plans is being switched on. Your plan keeps working meanwhile; check back soon.</EmptyState>
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
              {credit > 0 && (
                <p className="rounded-[8px] border border-accent/30 bg-accent/[0.07] px-3 py-2 text-sm text-secondary">
                  Basket credit from Toss: <span className="font-semibold text-fg">−{sub.money(credit)}</span>. Toss pays back{" "}
                  {platform.creditTossSharePct}% of the basket credit your customers use, off your subscription.
                </p>
              )}
              {pct > 0 && (
                <p className="rounded-[8px] border border-good/30 bg-good-bg px-3 py-2 text-sm text-good">
                  {pct}% off for paying {months} months at once: <s className="opacity-70">{sub.money(full)}</s>{" "}
                  <span className="font-semibold">{sub.money(beforeCredit)}</span>. You save {sub.money(saved)}.
                </p>
              )}
              <p className="text-sm text-secondary">
                {runningUntil ? (
                  <>
                    Your plan runs until <span className="text-fg">{fmt.date(runningUntil.toISOString())}</span>. Paying now adds {months} month{months > 1 ? "s" : ""} on top, so it runs
                    until <span className="font-semibold text-fg">{fmt.date(extendedTo.toISOString())}</span>. Nothing you&apos;ve paid for is lost.
                  </>
                ) : (
                  <>
                    Paying now turns Pro on until <span className="font-semibold text-fg">{fmt.date(extendedTo.toISOString())}</span>.
                  </>
                )}
              </p>
              {!phoneKnown && (
                <ActionForm action={savePayerPhone} submitLabel="Save">
                  <Field label="Mobile number for payments" hint="Saved once, so the payment page fills it in instead of asking every time.">
                    <input name="phone" type="tel" inputMode="tel" autoComplete="tel" required className={fieldClass} />
                  </Field>
                </ActionForm>
              )}
              <GatewayPay key={months} start={paySubscriptionOnline.bind(null, months)} amountLabel={sub.money(amount)} gatewayName={online!} />
            </div>
          )}
        </Card>
      )}

      {plan.state !== "SUSPENDED" && renewGateway && (
        <Card title="Renew automatically">
          <AutoRenew
            status={renewal}
            start={startPlanRenewal}
            stop={stopPlanRenewal}
            priceLabel={sub.money(quote(1).amount)}
            gatewayName={renewGateway}
            firstCharge={plan.state === "TRIAL" || plan.state === "ACTIVE" ? fmt.date(plan.until!) : undefined}
            india={!usd}
          />
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
                  {moneyIn(p.amount, p.currency)} · {p.months} month{p.months > 1 ? "s" : ""}
                  <span className="ml-2 font-mono text-xs text-muted">{p.paymentRef}</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {fmt.dateTime(p.createdAt)}
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
