import type { Metadata } from "next";
import Link from "next/link";
import { currentTier, planGate } from "@/components/plan-gate";
import { sendForDelivery } from "@/lib/actions/delivery";
import { markReady } from "@/lib/actions/service";
import { DELIVERY_LABEL } from "@/lib/dispatch/delivery";
import { dueLabel, isLate } from "@/lib/turnaround";
import { Badge, Card, EmptyState, OrderStatusBadge, PageTitle, StatTile } from "@/components/ui";
import { deviceLabel, isDeviceOnline, listActiveOrders, listDevices, listDrivers, listOrders, now } from "@/lib/data";
import { formatINR, formatKg, orderLabel, timeAgo } from "@/lib/format";
import { washQueue } from "@/lib/sorting";

export const metadata: Metadata = { title: "Live board" };

const STALE_PENDING_MINS = 15;

export default async function LiveBoard() {
  const locked = await planGate();
  if (locked) return locked;

  const [active, devices, drivers, all, tier] = await Promise.all([
    listActiveOrders(),
    listDevices(),
    listDrivers(),
    listOrders(),
    currentTier(),
  ]);
  const current = now();
  // promised turnaround: picked up, not ready, past the promise (Pro)
  const late = tier?.tier === "PRO" ? all.filter((o) => isLate(o, current)).slice(0, 8) : [];
  const pending = active.filter((o) => o.status === "PENDING");
  const enRoute = active.filter((o) => o.status === "ACCEPTED");
  const outstanding = all
    .filter((o) => o.status === "COMPLETED" && o.paymentStatus === "UNPAID")
    .reduce((s, o) => s + o.amountDue, 0);
  // Order.driverId is the driver's Telegram chat ID (from the Accept button callback).
  const driverName = (chatId?: string) =>
    chatId ? (drivers.find((d) => d.telegramChatId === chatId)?.name ?? `Driver …${chatId.slice(-4)}`) : "—";
  const deviceArea = (id: string) => deviceLabel(devices.find((d) => d.deviceId === id));
  // picked up and not ready yet: what's waiting to be washed, whites and coloured apart
  const wash = washQueue(all);
  // on the way back to customers
  const deliveries = all.filter((o) => o.deliveryStatus === "WAITING" || o.deliveryStatus === "ASSIGNED" || o.deliveryStatus === "OUT");
  const outNow = deliveries.filter((o) => o.deliveryStatus === "OUT").length;

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker="Command centre">Live board</PageTitle>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Awaiting driver" value={String(pending.length)} />
        <StatTile label="En route" value={String(enRoute.length)} hint={outNow ? `+ ${outNow} out for delivery` : undefined} />
        <StatTile
          label="Baskets online"
          value={`${devices.filter(isDeviceOnline).length} / ${devices.length}`}
        />
        <StatTile label="Unpaid invoices" value={formatINR(outstanding)} />
      </div>

      {late.length > 0 && (
        <Card title={`Running late (${late.length})`} action={<Badge tone="critical">Past promise</Badge>}>
          <ul className="divide-y divide-border">
            {late.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm">
                  <Link href={`/admin/orders/${encodeURIComponent(o.id)}`} className="font-mono text-xs text-accent hover:text-accent-2">
                    {orderLabel(o)}
                  </Link>{" "}
                  <span className="text-muted">{deviceArea(o.deviceId)}</span>
                  <span className="ml-2 font-medium text-critical">{dueLabel(o, current)}</span>
                </span>
                <form action={markReady}>
                  <input type="hidden" name="orderId" value={o.id} />
                  <button className="btn-ghost rounded-full px-3.5 py-1.5 text-xs font-medium text-fg">Mark ready</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {wash.orders > 0 && (
        <Card title="To wash" action={<span className="text-xs text-muted">{wash.orders} order{wash.orders === 1 ? "" : "s"} not ready yet</span>}>
          <dl className="grid grid-cols-3 gap-4">
            <div className="border-t-2 border-fg pt-3">
              <dt className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">Whites</dt>
              <dd className="mt-1.5 font-mono text-xl font-semibold tabular-nums">{formatKg(wash.whites)}</dd>
            </div>
            <div className="border-t-2 border-fg pt-3">
              <dt className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">Coloured</dt>
              <dd className="mt-1.5 font-mono text-xl font-semibold tabular-nums">{formatKg(wash.coloured)}</dd>
            </div>
            <div className="border-t-2 border-fg pt-3">
              <dt className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">Not sorted</dt>
              <dd className="mt-1.5 font-mono text-xl font-semibold tabular-nums">{formatKg(wash.unsorted)}</dd>
            </div>
          </dl>
        </Card>
      )}

      {deliveries.length > 0 && (
        <Card title={`Deliveries (${deliveries.length})`} action={<span className="text-xs text-muted">Clean clothes going back</span>}>
          <ul className="divide-y divide-border">
            {deliveries.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm">
                  <Link href={`/admin/orders/${encodeURIComponent(o.id)}`} className="font-mono text-xs text-accent hover:text-accent-2">
                    {orderLabel(o)}
                  </Link>{" "}
                  <span className="text-muted">{deviceArea(o.deviceId)}</span>
                  {o.deliveryDriverId && <span className="ml-2 text-secondary">{driverName(o.deliveryDriverId)}</span>}
                  {(o.deliveryAttempts ?? 0) > 0 && <span className="ml-2 text-xs text-warn">not home ×{o.deliveryAttempts}</span>}
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={o.deliveryStatus === "WAITING" ? "warn" : "info"}>{DELIVERY_LABEL[o.deliveryStatus!]}</Badge>
                  {o.deliveryStatus === "WAITING" && (
                    <form action={sendForDelivery}>
                      <input type="hidden" name="orderId" value={o.id} />
                      <button className="btn-ghost rounded-full px-3.5 py-1.5 text-xs font-medium text-fg">Send</button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Active pickups" action={<Badge tone="good" live>Live</Badge>}>
        {active.length === 0 ? (
          <EmptyState>No active pickups right now.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {active.map((o) => {
              const ageMins = (current.getTime() - new Date(o.createdAt).getTime()) / 60_000;
              const stale = o.status === "PENDING" && ageMins > STALE_PENDING_MINS;
              return (
                <li key={o.id} className="-mx-2 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[8px] px-2 py-3 transition-colors hover:bg-ink/[0.03]">
                  <div className="min-w-[200px] flex-1">
                    <p className="text-sm font-medium">
                      {deviceArea(o.deviceId)}{" "}
                      <Link href={`/admin/orders/${encodeURIComponent(o.id)}`} className="font-mono text-xs text-accent hover:text-accent-2">
                        {orderLabel(o)} →
                      </Link>
                    </p>
                    <p className="text-sm text-secondary">{o.address}</p>
                  </div>
                  <p className="text-sm tabular-nums">{formatKg(o.weightKg)}</p>
                  <p className="w-24 text-sm text-secondary">{driverName(o.driverId)}</p>
                  <div className="flex w-56 items-center gap-2">
                    <OrderStatusBadge status={o.status} />
                    {stale ? (
                      <Badge tone="critical" icon="!">{timeAgo(o.createdAt, current)}</Badge>
                    ) : (
                      <span className="text-xs text-muted">{timeAgo(o.createdAt, current)}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
