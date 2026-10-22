import type { Metadata } from "next";
import { OrderLink } from "@/components/order-link";
import { Onboarding } from "@/components/onboarding";
import { realBaskets } from "@/lib/rounds";
import { dispatchDue } from "@/lib/bookings";
import { cancelBookingAsManager } from "@/lib/actions/bookings";
import { WeightForm } from "./orders/[id]/weight-form";
import { currentTier, planGate } from "@/components/plan-gate";
import { sendForDelivery } from "@/lib/actions/delivery";
import { markReady } from "@/lib/actions/service";
import { DELIVERY_LABEL } from "@/lib/dispatch/delivery";
import { dueLabel, isLate } from "@/lib/turnaround";
import { Badge, Card, EmptyState, OrderStatusBadge, PageTitle, StatTile } from "@/components/ui";
import Link from "next/link";
import { attentionItems, type Attention } from "@/lib/attention";
import { deviceLabel, getTenantById, isDeviceOnline, listActiveOrders, listDevices, listDrivers, listOrders, listSupplies, now } from "@/lib/data";
import { planState } from "@/lib/plan";
import { getSession } from "@/lib/session";
import { timeAgo } from "@/lib/format";
import { washQueue } from "@/lib/sorting";
import { myFormat } from "@/lib/my-format";
import { paidOnline } from "@/lib/pay-methods";
import { formatterFor, regionOf } from "@/lib/region-format";
import { after } from "next/server";
import { reconcileFor } from "@/lib/gateway-payments";

export const metadata: Metadata = { title: "Live board" };

const STALE_PENDING_MINS = 15;

export default async function LiveBoard() {
  const fmt = await myFormat();
  const locked = await planGate();
  if (locked) return locked;

  const session = await getSession();
  // open gateway payments: ask the gateway after this page is sent (the live updates show the result)
  if (session?.tenantId) after(() => reconcileFor({ tenantId: session.tenantId }).catch(() => 0));
  // bookings for a time slot and hostel rounds that have come up go to drivers (also runs from the cron jobs)
  after(() => dispatchDue().catch(() => undefined));
  const [active, devices, drivers, all, tier, tenant] = await Promise.all([
    listActiveOrders(),
    listDevices(),
    listDrivers(),
    listOrders(),
    currentTier(),
    getTenantById(session?.tenantId),
  ]);
  const current = now();
  const pro = tier?.tier === "PRO";
  // what needs the manager now, with the fix; on Free the Pro alerts are counted but locked
  const supplies = pro ? await listSupplies() : [];
  const plan = tenant ? planState(tenant) : undefined;
  const allAlerts = tenant
    ? attentionItems({
        now: current,
        orders: all,
        devices,
        drivers,
        lowStock: supplies.filter((s) => s.stock <= s.lowAt),
        business: { upiId: tenant.upiId, storeAddress: tenant.storeAddress, storeLocated: !!tenant.storeLocated, delivers: tenant.delivers, paidOnline: paidOnline(tenant), india: tenant.currency === "INR", onlineGateway: !!tenant.onlineGateway },
        money: formatterFor(regionOf(tenant)).money,
        plan: { state: plan!.state, daysLeft: plan!.daysLeft },
      })
    : [];
  const PRO_ALERTS = ["late", "overdue", "stock", "baskets"];
  const alerts = pro ? allAlerts : allAlerts.filter((a) => !PRO_ALERTS.includes(a.key));
  const lockedAlerts = pro ? [] : allAlerts.filter((a) => PRO_ALERTS.includes(a.key));
  // promised turnaround: picked up, not ready, past the promise (Pro)
  const late = tier?.tier === "PRO" ? all.filter((o) => isLate(o, current)).slice(0, 8) : [];
  // booked for later (a time slot or a hostel round): not waiting for a driver yet
  const later = (o: { pickupAfter?: string }) => !!o.pickupAfter && new Date(o.pickupAfter).getTime() - 30 * 60_000 > current.getTime();
  const scheduled = active.filter((o) => o.status === "PENDING" && later(o)).sort((a, b) => a.pickupAfter!.localeCompare(b.pickupAfter!));
  const pending = active.filter((o) => o.status === "PENDING" && !later(o));
  // collected without a weight: the laundry weighs them at the store, then the customer gets the bill
  const toWeigh = all.filter((o) => o.weighPending && o.status === "COMPLETED").slice(0, 20);
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

  // first-run checklist, from real data; it disappears once everything is done
  const setup = tenant
    ? [
        { done: !!tenant.storeLocated, title: "Place your store on the map", hint: "So customers nearby find you and drivers get routes that end at the store.", href: "/admin/business", cta: "Set location" },
        { done: paidOnline(tenant) || !!tenant.onlineGateway, title: "Choose how customers pay you", hint: "Connect a payment gateway, or add your UPI ID or other payment details.", href: "/admin/settings/online-payments", cta: "Set up payments" },
        { done: drivers.some((d) => !!d.telegramChatId), title: "Add a driver and connect Telegram", hint: "They open the driver bot, share their number and tap Online.", href: "/admin/fleet", cta: "Add a driver" },
        { done: all.length > 0, title: "Get your first pickup", hint: "Share your Business ID so customers can join and book (no basket needed), or book one for a customer who phoned.", href: "/admin/orders#new-pickup", cta: "Book a pickup" },
        { done: all.some((o) => o.status === "COMPLETED"), title: "Finish your first pickup", hint: "Once a driver weighs and picks up a bag, you'll see the bill and payment here.", href: "/admin/orders", cta: "See orders" },
      ]
    : [];

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker="Command centre">Live board</PageTitle>

      <Onboarding title={`Welcome${tenant ? `, ${tenant.name}` : ""}. Five steps to your first pickup`} steps={setup} />

      <NeedsAttention alerts={alerts} locked={lockedAlerts} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Waiting for a driver" value={String(pending.length)} />
        <StatTile label="Driver on the way" value={String(enRoute.length)} hint={outNow ? `+ ${outNow} out for delivery` : undefined} />
        <StatTile
          label="Baskets online"
          value={`${realBaskets(devices).filter(isDeviceOnline).length} / ${realBaskets(devices).length}`}
        />
        <StatTile label="Unpaid bills" value={fmt.money(outstanding)} />
      </div>

      {toWeigh.length > 0 && (
        <Card id="to-weigh" title={`To weigh at the store (${toWeigh.length})`} action={<Badge tone="warn">Bill waits for the weight</Badge>}>
          <ul className="divide-y divide-border">
            {toWeigh.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <span className="min-w-0 text-sm">
                  <OrderLink order={o} />
                  <span className="ml-2 text-secondary">{o.contactName ?? o.address}</span>
                  {o.weightKg > 0 && <span className="ml-2 text-muted">· basket said {fmt.weight(o.weightKg)}</span>}
                </span>
                <WeightForm
                  orderId={o.id}
                  current={0}
                  bags={tenant?.sortWhites ? { whites: 0, coloured: 0 } : undefined}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {scheduled.length > 0 && (
        <Card title={`Booked for later (${scheduled.length})`} action={<Badge tone="info">Goes to a driver 30 min before</Badge>}>
          <ul className="divide-y divide-border">
            {scheduled.slice(0, 12).map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm">
                  <span className="font-medium tabular-nums">{fmt.dateTime(o.pickupAfter!)}</span>
                  <span className="ml-2 text-secondary">{o.address}</span>
                  {o.contactName && <span className="ml-2 text-muted">· {o.contactName}</span>}
                  {o.roundAccountId && <span className="ml-2 text-muted">· hostel round</span>}
                </span>
                <form action={cancelBookingAsManager}>
                  <input type="hidden" name="orderId" value={o.id} />
                  <button className="text-xs text-secondary hover:text-critical">Cancel</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {late.length > 0 && (
        <Card id="late" title={`Running late (${late.length})`} action={<Badge tone="critical">Past promise</Badge>}>
          <ul className="divide-y divide-border">
            {late.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm">
                  <OrderLink order={o} />{" "}
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
              <dd className="mt-1.5 font-mono text-xl font-semibold tabular-nums">{fmt.weight(wash.whites)}</dd>
            </div>
            <div className="border-t-2 border-fg pt-3">
              <dt className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">Coloured</dt>
              <dd className="mt-1.5 font-mono text-xl font-semibold tabular-nums">{fmt.weight(wash.coloured)}</dd>
            </div>
            <div className="border-t-2 border-fg pt-3">
              <dt className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">Not sorted</dt>
              <dd className="mt-1.5 font-mono text-xl font-semibold tabular-nums">{fmt.weight(wash.unsorted)}</dd>
            </div>
          </dl>
        </Card>
      )}

      {deliveries.length > 0 && (
        <Card id="deliveries" title={`Deliveries (${deliveries.length})`} action={<span className="text-xs text-muted">Clean clothes going back</span>}>
          <ul className="divide-y divide-border">
            {deliveries.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm">
                  <OrderLink order={o} />{" "}
                  <span className="text-muted">{deviceArea(o.deviceId)}</span>
                  {o.deliveryDriverId && <span className="ml-2 text-secondary">{driverName(o.deliveryDriverId)}</span>}
                  {o.deliveryDriverId && !o.deliveryAckAt && <span className="ml-2 text-xs text-warn">⏳ not confirmed</span>}
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
                      <OrderLink order={o} />
                    </p>
                    <p className="text-sm text-secondary">{o.address}</p>
                  </div>
                  <p className="text-sm tabular-nums">{fmt.weight(o.weightKg)}</p>
                  <p className="w-28 text-sm text-secondary">
                    {driverName(o.driverId)}
                    {o.driverId && !o.driverAckAt && <span className="block text-[11px] text-warn">⏳ not confirmed</span>}
                  </p>
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

const TONE: Record<Attention["level"], string> = { critical: "border-l-critical", warn: "border-l-warn", info: "border-l-accent" };

// The top of the live board: every problem Toss can see right now, what to do about it, and a button to do it.
function NeedsAttention({ alerts, locked }: { alerts: Attention[]; locked: Attention[] }) {
  if (!alerts.length && !locked.length) {
    return (
      <div role="status" className="flex items-center gap-3 rounded-[10px] border border-l-4 border-border border-l-good bg-surface-solid px-5 py-4">
        <span aria-hidden className="grid size-8 place-items-center rounded-full bg-good-bg text-good">✓</span>
        <span>
          <span className="block font-medium text-fg">All clear</span>
          <span className="text-sm text-secondary">Nothing needs you right now. New problems show up here by themselves.</span>
        </span>
      </div>
    );
  }
  return (
    <section aria-labelledby="attention-title" className="space-y-2">
      <h2 id="attention-title" className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
        Needs attention
        {alerts.length > 0 && <span className="rounded-full bg-critical-bg px-1.5 py-0.5 text-critical">{alerts.length}</span>}
      </h2>
      <ul className="space-y-2">
        {alerts.map((a) => (
          <li key={a.key} className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] border border-l-4 border-border bg-surface-solid px-4 py-3 ${TONE[a.level]}`}>
            <span className="min-w-[220px] flex-1">
              <span className="block font-medium text-fg">{a.title}</span>
              <span className="text-sm text-secondary">{a.fix}</span>
            </span>
            <Link
              href={a.href}
              className={`${a.level === "critical" ? "btn-primary" : "btn-ghost text-fg"} shrink-0 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap`}
            >
              {a.action} →
            </Link>
          </li>
        ))}
        {locked.length > 0 && (
          <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] border border-dashed border-border-strong px-4 py-3">
            <span className="min-w-[220px] flex-1 text-sm text-secondary">
              <span className="font-medium text-fg">
                🔒 {locked.length} more alert{locked.length === 1 ? "" : "s"} with Pro
              </span>
              <span className="block">{locked.map((a) => a.title).join(" · ")}</span>
            </span>
            <Link href="/admin/billing" className="btn-primary shrink-0 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap">
              Unlock with Pro →
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}
