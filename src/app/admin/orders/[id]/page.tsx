import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { planGate } from "@/components/plan-gate";
import { StatusTimeline } from "@/components/status-timeline";
import { Card, OrderStatusBadge, PageTitle, PaymentBadge } from "@/components/ui";
import { confirmPayment, markPaidCash, rejectPayment } from "@/lib/actions/manager";
import { assignDriver, autoAssign, setOrderStatus } from "@/lib/actions/manager-ops";
import { deviceLabel, getOrder, listCustomers, listDevices, listDrivers, listOrderEvents } from "@/lib/data";
import { formatDateTime, formatINR, formatKg, orderLabel } from "@/lib/format";
import { AmountForm } from "../../payments/amount-form";

export const metadata: Metadata = { title: "Order" };

const EVENT_LABEL: Record<string, string> = {
  PENDING: "Basket full: pickup requested",
  ACCEPTED: "Driver accepted (bot)",
  COMPLETED: "Driver completed pickup (bot)",
  CANCELLED: "Cancelled",
};

export default async function OrderDetail({ params }: PageProps<"/admin/orders/[id]">) {
  const locked = await planGate();
  if (locked) return locked;

  const { id: raw } = await params;
  const id = raw.includes("%") ? decodeURIComponent(raw) : raw;
  const order = await getOrder(id);
  if (!order) notFound(); // RLS: other businesses' orders simply don't exist for this manager

  const [events, drivers, customers, devices] = await Promise.all([listOrderEvents(id), listDrivers(), listCustomers(), listDevices()]);
  const customer = customers.find((c) => c.id === order.customerId);
  const device = devices.find((d) => d.deviceId === order.deviceId);
  const driver = drivers.find((d) => d.telegramChatId === order.driverId);
  const open = order.status === "PENDING" || order.status === "ACCEPTED";

  return (
    <div className="stagger max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle kicker={`Order ${orderLabel(order)}`}>{formatINR(order.amountDue)}</PageTitle>
        <div className="flex gap-2">
          <OrderStatusBadge status={order.status} />
          <PaymentBadge status={order.paymentStatus} />
        </div>
      </div>
      <Link href="/admin/orders" className="text-sm text-accent hover:text-accent-2">
        ← All orders
      </Link>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Pickup">
          <StatusTimeline order={order} />
          <dl className="mt-5 grid grid-cols-[110px_1fr] gap-y-2 border-t border-border pt-4 text-sm">
            <dt className="text-muted">Customer</dt>
            <dd>{customer ? `${customer.name ?? customer.email} · ${customer.customerCode}` : "Not linked yet"}</dd>
            <dt className="text-muted">Basket</dt>
            <dd>{deviceLabel(device) ?? order.deviceId}</dd>
            <dt className="text-muted">Address</dt>
            <dd>{order.address || "—"}</dd>
            <dt className="text-muted">Weight</dt>
            <dd className="tabular-nums">{formatKg(order.weightKg)}</dd>
            <dt className="text-muted">Driver</dt>
            <dd>{driver?.name ?? (order.driverId ? `Telegram ${order.driverId}` : "—")}</dd>
          </dl>
        </Card>

        <Card title="Manage pickup">
          {open ? (
            <div className="space-y-5">
              <form action={assignDriver} className="space-y-2">
                <input type="hidden" name="orderId" value={order.id} />
                <label className="block text-xs font-medium text-secondary" htmlFor="driver">
                  {order.driverId ? "Reassign driver" : "Assign a driver"}
                </label>
                <div className="flex gap-2">
                  <select
                    id="driver"
                    name="driverChatId"
                    defaultValue={order.driverId ?? ""}
                    className="flex-1 rounded-xl border border-border bg-surface-solid px-3 py-2 text-sm"
                  >
                    <option value="">— No driver —</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.telegramChatId}>
                        {d.name} ({d.status === "AVAILABLE" ? "available" : d.status === "ON_JOB" ? "on a job" : "offline"})
                      </option>
                    ))}
                  </select>
                  <button className="btn-primary rounded-full px-4 py-2 text-sm font-medium">Save</button>
                </div>
                {drivers.length === 0 && (
                  <p className="text-xs text-muted">
                    Add drivers on the <Link href="/admin/fleet" className="underline">Fleet</Link> page first.
                  </p>
                )}
              </form>
              {!order.driverId && (
                <div className="flex flex-wrap items-center gap-3">
                  <ConfirmButton
                    action={autoAssign}
                    fields={{ orderId: order.id }}
                    label="⚡ Auto-assign nearest driver"
                    tone="neutral"
                    confirm="Send this pickup to the nearest online driver now?"
                  />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
                {order.status === "PENDING" && (
                  <form action={setOrderStatus}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="status" value="ACCEPTED" />
                    <button className="btn-ghost rounded-full px-4 py-1.5 text-sm">Mark accepted</button>
                  </form>
                )}
                <form action={setOrderStatus}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="status" value="COMPLETED" />
                  <button className="btn-ghost rounded-full px-4 py-1.5 text-sm">Mark picked up</button>
                </form>
                <ConfirmButton
                  action={setOrderStatus}
                  fields={{ orderId: order.id, status: "CANCELLED" }}
                  label="Cancel pickup"
                  confirm="Cancel this pickup? The customer won't be charged for it."
                />
              </div>
              <p className="text-xs text-muted">Use these if a driver forgot to tap Accept or Complete in the bot.</p>
            </div>
          ) : (
            <p className="text-sm text-secondary">
              {order.status === "COMPLETED" ? "This pickup is complete." : "This pickup was cancelled."}
            </p>
          )}
        </Card>
      </div>

      {order.status !== "CANCELLED" && (
        <Card title="Payment">
          <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
            <div className="space-y-1">
              <p>
                <span className="text-2xl font-semibold tabular-nums">{formatINR(order.amountDue)}</span>{" "}
                <span className="text-muted">for {formatKg(order.weightKg)}</span>
              </p>
              {order.paymentRef && (
                <p className="text-xs text-muted">
                  {order.paymentMethod ?? "UPI"} ref <span className="font-mono text-fg">{order.paymentRef}</span>
                  {order.paymentReportedAt ? ` · reported ${formatDateTime(order.paymentReportedAt)}` : ""}
                </p>
              )}
              {order.paymentConfirmedAt && <p className="text-xs text-good">Confirmed {formatDateTime(order.paymentConfirmedAt)}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {order.paymentStatus === "PENDING" && (
                <>
                  <form action={confirmPayment}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <button className="btn-primary rounded-full px-4 py-1.5 text-sm font-medium">✓ Received</button>
                  </form>
                  <form action={rejectPayment}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <button className="btn-ghost rounded-full px-4 py-1.5 text-sm text-critical">Not received</button>
                  </form>
                </>
              )}
              {order.paymentStatus === "UNPAID" && (
                <>
                  <AmountForm orderId={order.id} amount={order.amountDue} />
                  <form action={markPaidCash}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <button className="btn-ghost rounded-full px-4 py-1.5 text-sm">Mark paid (cash)</button>
                  </form>
                </>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card title="Basket log">
        {events.length === 0 ? (
          <p className="text-sm text-muted">No messages from the basket recorded for this order.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2 border-b border-border pb-2 last:border-0">
                <span>{EVENT_LABEL[e.type] ?? e.type}</span>
                <span className="text-xs text-muted">{formatDateTime(e.at)}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
