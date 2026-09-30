import Link from "next/link";
import { OrderTable } from "@/components/order-table";
import { PayButton } from "@/components/pay-button";
import { StatusTimeline } from "@/components/status-timeline";
import { Card, EmptyState, FillBar, OnlineBadge, OrderStatusBadge, PageTitle } from "@/components/ui";
import { getCustomer, getDeviceForCustomer, isDeviceOnline, listOrdersForCustomer, now } from "@/lib/data";
import { formatDate, formatINR, formatKg, orderLabel, timeAgo } from "@/lib/format";
import { requireRole } from "@/lib/session";

export default async function CustomerOverview() {
  const session = await requireRole("CUSTOMER");
  const [orders, device, customer] = await Promise.all([
    listOrdersForCustomer(session.userId),
    getDeviceForCustomer(session.userId),
    getCustomer(session.userId),
  ]);

  const active = orders.find((o) => o.status === "PENDING" || o.status === "ACCEPTED");
  const unpaid = orders.filter((o) => o.status === "COMPLETED" && o.paymentStatus === "UNPAID");
  const firstName = customer?.name?.split(" ")[0] ?? session.email?.split("@")[0] ?? "there";

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker="Overview">Hi, {firstName} 👋</PageTitle>

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
        {unpaid.length ? (
          <ul className="divide-y divide-border">
            {unpaid.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="text-sm">
                  <p className="font-medium">
                    Pickup {orderLabel(o)} · {formatDate(o.createdAt)}
                  </p>
                  <p className="text-muted tabular-nums">{formatKg(o.weightKg)}</p>
                </div>
                <PayButton amountLabel={formatINR(o.amountDue)} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>You&apos;re all paid up.</EmptyState>
        )}
      </Card>

      <Card title="Recent orders" action={<Link href="/app/orders" className="text-sm text-accent transition-colors hover:text-accent-2">View all →</Link>}>
        <OrderTable orders={orders.slice(0, 5)} />
      </Card>
    </div>
  );
}
