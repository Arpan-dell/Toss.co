import { ConfirmButton } from "@/components/confirm-button";
import { Badge } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { assignDeliveryDriverForm, closeDelivery, sendForDelivery } from "@/lib/actions/delivery";
import { DELIVERY_LABEL } from "@/lib/dispatch/delivery";
import { formatDateTime } from "@/lib/format";
import type { Driver, Order } from "@/lib/types";

// Order page: getting a picked-up order back to the customer. Send it to a driver (or choose one), follow it, or
// close it by hand when the customer collected it at the store.
export function DeliveryPanel({ order, drivers }: { order: Order; drivers: Driver[] }) {
  const d = order.deliveryStatus;
  const name = (chatId?: string) => (chatId ? (drivers.find((x) => x.telegramChatId === chatId)?.name ?? `Driver …${chatId.slice(-4)}`) : undefined);
  const open = d === "WAITING" || d === "ASSIGNED" || d === "OUT";
  const closed = d === "DELIVERED" || d === "COLLECTED";

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-fg">Back to the customer</span>
        {d ? (
          <Badge tone={closed ? "good" : d === "WAITING" ? "warn" : "info"}>{DELIVERY_LABEL[d]}</Badge>
        ) : order.readyAt ? (
          <Badge tone="neutral">{order.deliveryCode ? "Waiting to be collected" : "Ready"}</Badge>
        ) : (
          <Badge tone="neutral">Being washed</Badge>
        )}
      </div>

      <dl className="grid grid-cols-[110px_1fr] gap-y-1.5">
        {order.deliveryDriverId && (
          <>
            <dt className="text-muted">Driver</dt>
            <dd>{name(order.deliveryDriverId)}</dd>
          </>
        )}
        {order.deliveryCode && !closed && (
          <>
            <dt className="text-muted">Customer code</dt>
            <dd className="font-mono tracking-[0.2em]">{order.deliveryCode}</dd>
          </>
        )}
        {(order.deliveryAttempts ?? 0) > 0 && (
          <>
            <dt className="text-muted">Attempts</dt>
            <dd className="text-warn">{order.deliveryAttempts} failed: customer not home</dd>
          </>
        )}
        {closed && order.deliveredAt && (
          <>
            <dt className="text-muted">{d === "COLLECTED" ? "Collected" : "Delivered"}</dt>
            <dd>
              {formatDateTime(order.deliveredAt)}
              {d === "DELIVERED" && order.deliveryVerified === true && <span className="ml-2 text-good">code checked ✓</span>}
              {d === "DELIVERED" && order.deliveryVerified === false && <span className="ml-2 text-warn">without the code</span>}
            </dd>
          </>
        )}
      </dl>

      {!order.readyAt && <p className="text-xs text-muted">Mark it ready when it&apos;s washed: it then goes out for delivery by itself.</p>}

      {order.readyAt && !closed && (
        <div className="space-y-3 border-t border-border pt-4">
          {(d === "WAITING" || !d) && (
            <ConfirmButton
              action={sendForDelivery}
              fields={{ orderId: order.id }}
              label={(order.deliveryAttempts ?? 0) > 0 ? "⚡ Try delivering again" : "⚡ Send to nearest driver"}
              tone="neutral"
              confirm="Send this order to the nearest online driver for delivery?"
            />
          )}
          {open && (
            // keyed on the saved driver, so after Save the dropdown shows what's really assigned
            <ActionForm
              key={order.deliveryDriverId ?? "none"}
              action={assignDeliveryDriverForm}
              submitLabel="Save driver"
              className="space-y-2"
              submitClassName="btn-primary rounded-full px-4 py-2 text-sm font-medium disabled:opacity-70"
            >
              <input type="hidden" name="orderId" value={order.id} />
              <label className="block text-xs font-medium text-secondary" htmlFor="deliveryDriver">
                {order.deliveryDriverId ? "Change the delivery driver" : "Choose a delivery driver"}
              </label>
              <select
                id="deliveryDriver"
                name="driverChatId"
                defaultValue={order.deliveryDriverId ?? ""}
                className="w-full rounded-[8px] border border-border bg-surface-solid px-3 py-2 text-sm"
              >
                <option value="">— No driver —</option>
                {drivers
                  .filter((x) => x.telegramChatId)
                  .map((x) => (
                    <option key={x.id} value={x.telegramChatId}>
                      {x.name} ({x.status === "AVAILABLE" ? "available" : x.status === "ON_JOB" ? "on a job" : "offline"})
                    </option>
                  ))}
              </select>
            </ActionForm>
          )}
          <div className="flex flex-wrap gap-3">
            {(d === "ASSIGNED" || d === "OUT") && (
              <ConfirmButton
                action={closeDelivery}
                fields={{ orderId: order.id, how: "delivered" }}
                label="Mark delivered"
                tone="neutral"
                confirm="Mark this order as delivered to the customer?"
              />
            )}
            {d !== "OUT" && (
              <ConfirmButton
                action={closeDelivery}
                fields={{ orderId: order.id, how: "collected" }}
                label="Customer collected it"
                tone="neutral"
                confirm="The customer picked this order up at the store?"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
