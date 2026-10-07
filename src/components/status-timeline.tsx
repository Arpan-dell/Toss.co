import type { Order } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

type Step = { label: string; at?: string; done: boolean };

// The whole round trip: the pickup (PENDING → ACCEPTED → COMPLETED, from the driver bot), then the way back once
// the laundry marks it ready: out for delivery and delivered, or collected at the store.
function steps(order: Order): Step[] {
  const pickedUp = order.status === "COMPLETED";
  const pickup: Step[] = [
    { label: "Basket full — pickup requested", at: order.createdAt, done: true },
    { label: "Driver accepted", at: order.acceptedAt, done: order.status === "ACCEPTED" || pickedUp },
    { label: "Picked up", at: order.completedAt, done: pickedUp },
  ];
  if (order.status === "CANCELLED") return pickup;
  const d = order.deliveryStatus;
  const ready: Step = { label: "Washed and ready", at: order.readyAt, done: !!order.readyAt };
  // collected at the store, or a laundry that doesn't deliver (ready, with a code, no delivery)
  if (d === "COLLECTED" || (order.readyAt && !d && order.deliveryCode)) {
    return [...pickup, ready, { label: "Collected from the store", at: d === "COLLECTED" ? order.deliveredAt : undefined, done: d === "COLLECTED" }];
  }
  // finished before deliveries existed: the trip ends at "ready"
  if (order.readyAt && !d) return [...pickup, ready];
  return [
    ...pickup,
    ready,
    { label: "Out for delivery", at: order.outForDeliveryAt, done: d === "OUT" || d === "DELIVERED" },
    { label: "Delivered", at: order.deliveredAt, done: d === "DELIVERED" },
  ];
}

export function StatusTimeline({ order }: { order: Order }) {
  const all = steps(order);
  const current = all.findIndex((s) => !s.done);

  return (
    <ol className="relative space-y-5">
      {all.map((s, i) => (
        <li key={s.label} className="relative flex gap-3">
          {i < all.length - 1 && (
            <span aria-hidden className={`absolute top-6 left-[9px] h-[calc(100%-4px)] w-px ${all[i + 1].done ? "bg-accent" : "bg-border"}`} />
          )}
          <span
            aria-hidden
            className={`relative z-10 mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] ${
              s.done ? "bg-accent font-bold text-accent-contrast" : i === current ? "pulse-ring border-2 border-accent bg-bg" : "border-2 border-border bg-bg"
            }`}
          >
            {s.done ? "✓" : ""}
          </span>
          <div>
            <p className={`text-sm ${s.done ? "text-fg" : i === current ? "font-medium text-fg" : "text-muted"}`}>
              {s.label}
              {i === current && <span className="ml-2 text-xs text-accent">up next</span>}
            </p>
            {s.at && <p className="text-xs text-muted">{formatDateTime(s.at)}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
