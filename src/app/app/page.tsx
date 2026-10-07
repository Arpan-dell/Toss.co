import Link from "next/link";
import { OrderTable } from "@/components/order-table";
import { IdChip } from "@/components/id-chip";
import { JoinBusiness } from "@/components/join-business";
import { UpiPay } from "@/components/upi-pay";
import { StatusTimeline } from "@/components/status-timeline";
import { Badge, Card, EmptyState, FillBar, OnlineBadge, OrderStatusBadge, PageTitle } from "@/components/ui";
import { reportPayment } from "@/lib/actions/customer";
import { getCustomer, getCustomerCredit, getDeviceForCustomer, getOpenOffer, getTenantById, isDeviceOnline, listOrdersForCustomer, now } from "@/lib/data";
import { formatDate, formatINR, formatKg, orderLabel, timeAgo } from "@/lib/format";
import { qrSvg } from "@/lib/qr";
import { requireRole } from "@/lib/session";
import { buildUpiUri, isValidUpiId } from "@/lib/upi";

export default async function CustomerOverview() {
  const session = await requireRole("CUSTOMER");
  const [orders, device, customer, credit] = await Promise.all([
    listOrdersForCustomer(session.userId),
    getDeviceForCustomer(session.userId),
    getCustomer(session.userId),
    getCustomerCredit(session.userId),
  ]);

  const active = orders.find((o) => o.status === "PENDING" || o.status === "ACCEPTED");
  // picked up and not back with the customer yet: being washed, ready to collect, or on its way back
  const weekAgo = now().getTime() - 7 * 86_400_000;
  const returning = orders
    .filter(
      (o) =>
        o.status === "COMPLETED" &&
        (o.deliveryStatus === "WAITING" ||
          o.deliveryStatus === "ASSIGNED" ||
          o.deliveryStatus === "OUT" ||
          (!o.deliveryStatus && o.readyAt && o.deliveryCode) ||
          (!o.deliveryStatus && !o.readyAt && new Date(o.completedAt ?? o.createdAt).getTime() >= weekAgo)),
    )
    .slice(0, 3);
  // pickups on a business account (PG, hostel) are paid monthly by the account, not here
  const unpaid = orders.filter((o) => o.status === "COMPLETED" && o.paymentStatus === "UNPAID" && !o.accountId);
  const verifying = orders.filter((o) => o.paymentStatus === "PENDING");
  const firstName = customer?.name?.split(" ")[0] ?? session.email?.split("@")[0] ?? "there";
  const [business, offer] = await Promise.all([getTenantById(customer?.tenantId), getOpenOffer(session.userId, customer?.tenantId)]);
  const canPay = !!business && isValidUpiId(business.upiId) && !!business.upiId;

  // One UPI link + QR per unpaid order, pre-filled with this business's UPI ID and the amount.
  const payments = canPay
    ? await Promise.all(
        unpaid
          .filter((o) => o.amountDue > 0)
          .map(async (o) => {
            const uri = buildUpiUri({
              payeeUpiId: business.upiId!,
              payeeName: business.upiName ?? business.name,
              amount: o.amountDue,
              note: `Toss pickup ${orderLabel(o)}`,
              reference: `TOSS${o.deviceOrderId}`,
            });
            return { order: o, uri, qr: await qrSvg(uri) };
          }),
      )
    : [];

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker="Overview">Hi, {firstName}</PageTitle>

      {offer && business && (
        <div
          role="status"
          className="relative rounded-[10px] border border-l-4 border-border border-l-good bg-surface-solid p-5"
        >
          <p className="font-mono text-[11px] tracking-[0.14em] text-good uppercase">We miss you</p>
          <p className="mt-1 text-xl font-semibold">
            {offer.percent}% off your next pickup from {business.name}
          </p>
          <p className="mt-1 text-sm text-secondary">
            Just fill your basket. The discount is applied automatically. Valid until {formatDate(offer.expiresAt)}.
          </p>
        </div>
      )}

      {credit && !credit.expired && credit.left > 0 && (
        <div role="status" className="relative rounded-[10px] border border-l-4 border-border border-l-accent bg-surface-solid p-5">
          <p className="font-mono text-[11px] tracking-[0.14em] text-accent uppercase">Basket credit</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {formatINR(credit.left)} left <span className="text-sm font-normal text-muted">of {formatINR(credit.granted)}</span>
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10" aria-hidden>
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (credit.left / Math.max(credit.granted, 1)) * 100)}%` }} />
          </div>
          <p className="mt-2 text-sm text-secondary">
            Comes off your pickups automatically, a little each time. Valid until {formatDate(credit.expiresAt)}.
          </p>
        </div>
      )}

      {customer && !customer.phone && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-l-4 border-border border-l-warn bg-surface-solid p-4">
          <p className="text-sm text-secondary">
            <span className="font-medium text-fg">Add your mobile number.</span> Your laundry&apos;s driver uses it to reach you at pickup,
            and it links your Telegram basket to this account.
          </p>
          <Link href="/app/settings" className="btn-primary rounded-full px-4 py-2 text-sm font-medium">
            Add number
          </Link>
        </div>
      )}

      <Card title={business ? "Your laundry" : "Connect to your laundry"}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          {business ? (
            <div>
              <p className="text-lg font-medium">{business.name}</p>
              <p className="text-sm text-secondary">
                Business ID <span className="font-mono text-fg">{business.joinCode}</span> · ₹{business.pricePerKg}/kg
              </p>
              <Link href="/laundries" className="mt-1 inline-block text-sm text-accent hover:underline">
                Compare laundries near you →
              </Link>
            </div>
          ) : (
            <div className="max-w-md flex-1 space-y-3">
              <p className="text-sm text-secondary">
                Ask your laundry for its <span className="text-fg">Business ID</span> and enter it here to see your pickups and pay
                them.
              </p>
              <JoinBusiness compact />
              <p className="border-t border-dotted border-border-strong pt-3 text-sm text-secondary">
                Don&apos;t know a laundry yet?{" "}
                <Link href="/laundries" className="font-medium text-accent hover:underline">
                  Find one that picks up near you →
                </Link>
              </p>
            </div>
          )}
          {customer && <IdChip label="Your Customer ID" value={customer.customerCode} />}
        </div>
      </Card>

      {returning.length > 0 && (
        <Card title="Coming back to you">
          <ul className="divide-y divide-border">
            {returning.map((o) => {
              const collect = !o.deliveryStatus && !!o.readyAt;
              const headline = !o.readyAt
                ? "Being washed"
                : collect
                  ? "Ready to collect at the store"
                  : o.deliveryStatus === "OUT"
                    ? "Out for delivery"
                    : o.deliveryStatus === "ASSIGNED"
                      ? "A driver is collecting it from the store"
                      : "Ready, a driver will bring it soon";
              return (
                <li key={o.id} className="grid gap-5 py-5 first:pt-0 last:pb-0 sm:grid-cols-2">
                  <div className="space-y-3">
                    <div>
                      <p className="font-mono text-xs text-muted">{orderLabel(o)}</p>
                      <p className="text-lg font-semibold">{headline}</p>
                      {(o.deliveryAttempts ?? 0) > 0 && o.deliveryStatus === "WAITING" && (
                        <p className="text-sm text-warn">We missed you last time. Your laundry will try again soon.</p>
                      )}
                    </div>
                    {o.deliveryCode && o.readyAt && (
                      <div className="rounded-[10px] border border-border bg-ink/[0.03] px-4 py-3">
                        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Your handover code</p>
                        <p className="mt-1 font-mono text-3xl font-semibold tracking-[0.3em] tabular-nums">{o.deliveryCode}</p>
                        <p className="mt-1 text-xs text-secondary">{collect ? "Show it at the store." : "Tell it to the driver at your door."}</p>
                      </div>
                    )}
                  </div>
                  <StatusTimeline order={o} />
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Active pickup" className="lg:col-span-2" action={active && <OrderStatusBadge status={active.status} />}>
          {active ? (
            <div className="grid gap-6 sm:grid-cols-2">
              <StatusTimeline order={active} />
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-muted">Order</dt>
                  <dd className="font-mono">{orderLabel(active)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Weight</dt>
                  <dd className="tabular-nums">{formatKg(active.weightKg)} · {formatINR(active.amountDue)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Pickup address</dt>
                  <dd>{active.address}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <EmptyState>No pickup in progress. Your basket will request one when it&apos;s full.</EmptyState>
          )}
        </Card>

        <Card title="My basket" action={device && <OnlineBadge online={isDeviceOnline(device)} />}>
          {device ? (
            <div className="space-y-4">
              {device.lastWeightKg !== undefined && (
                <p className="text-4xl font-semibold tracking-tighter tabular-nums">
                  {device.lastWeightKg.toFixed(1)}
                  <span className="ml-1 text-lg text-muted">kg</span>
                </p>
              )}
              <FillBar weightKg={device.lastWeightKg} targetKg={device.targetKg} />
              <p className="text-xs text-muted">
                {device.lastSeenAt ? `Last update ${timeAgo(device.lastSeenAt, now())}. ` : ""}Change your target or
                tare the scale from the Telegram bot.
              </p>
            </div>
          ) : (
            <div className="space-y-3 py-4 text-center text-sm text-muted">
              <p>No basket linked yet.</p>
              {!customer?.telegramId && (
                <Link href="/app/settings" className="text-accent transition-colors hover:text-accent-2">
                  Link your Telegram account →
                </Link>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card title="Invoices due">
        {unpaid.length === 0 && verifying.length === 0 && <EmptyState>You&apos;re all paid up.</EmptyState>}
        {unpaid.length > 0 && !canPay && (
          <p className="mb-4 rounded-[8px] border border-warn/30 bg-warn-bg px-3 py-2 text-sm text-warn">
            {business
              ? `${business.name} hasn't set up UPI payments yet. Pay them directly, and they'll mark it paid.`
              : "Connect to your laundry above to pay these invoices."}
          </p>
        )}
        <ul className="divide-y divide-border">
          {unpaid.map((o) => {
            const pay = payments.find((p) => p.order.id === o.id);
            return (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="text-sm">
                  <p className="font-medium">
                    Pickup {orderLabel(o)} · {formatDate(o.createdAt)}
                  </p>
                  <p className="text-muted tabular-nums">
                    {formatKg(o.weightKg)} · {formatINR(o.amountDue)}
                    {o.creditApplied ? (
                      <span className="ml-1.5 text-accent">
                        (basket credit −{formatINR(o.creditApplied)})
                      </span>
                    ) : null}
                  </p>
                </div>
                {pay && business && (
                  <UpiPay
                    uri={pay.uri}
                    qrSvg={pay.qr}
                    amountLabel={formatINR(o.amountDue)}
                    payeeName={business.upiName ?? business.name}
                    payeeUpiId={business.upiId!}
                    action={reportPayment}
                    hidden={{ orderId: o.id }}
                  />
                )}
              </li>
            );
          })}
          {verifying.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div className="text-sm">
                <p className="font-medium">
                  Pickup {orderLabel(o)} · {formatINR(o.amountDue)}
                </p>
                <p className="text-muted">UPI ref <span className="font-mono">{o.paymentRef}</span></p>
              </div>
              <Badge tone="warn" icon="…">Awaiting confirmation</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Recent orders" action={<Link href="/app/orders" className="text-sm text-accent transition-colors hover:text-accent-2">View all →</Link>}>
        <OrderTable orders={orders.slice(0, 5)} />
      </Card>
    </div>
  );
}
