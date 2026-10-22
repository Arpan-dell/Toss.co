import type { Order } from "./types";

// Where an order really is. "Completed" in the database only means the driver collected it; after that it's
// weighed (at the store, if the laundry weighs there), washed, marked ready, and delivered or collected. Showing
// every collected order as "Picked up" hid which ones were stuck in the wash.

export type Stage = "waiting" | "enroute" | "toweigh" | "washing" | "ready" | "collecting" | "out" | "delivered" | "collected" | "old" | "cancelled";
export type StageInfo = { key: Stage; label: string; tone: "good" | "warn" | "critical" | "info" | "neutral"; live?: boolean };

type StageOrder = Pick<Order, "status" | "weighPending" | "readyAt" | "deliveryStatus" | "completedAt">;

/** An old collected order that was never marked ready is history, not "in the wash". */
const STALE_MS = 14 * 86_400_000;

export function orderStage(o: StageOrder, now = new Date()): StageInfo {
  if (o.status === "CANCELLED") return { key: "cancelled", label: "Cancelled", tone: "neutral" };
  if (o.status === "PENDING") return { key: "waiting", label: "Awaiting driver", tone: "warn", live: true };
  if (o.status === "ACCEPTED") return { key: "enroute", label: "Driver en route", tone: "info", live: true };
  // collected
  if (o.deliveryStatus === "DELIVERED") return { key: "delivered", label: "Delivered", tone: "good" };
  if (o.deliveryStatus === "COLLECTED") return { key: "collected", label: "Collected", tone: "good" };
  if (o.deliveryStatus === "OUT") return { key: "out", label: "Out for delivery", tone: "info", live: true };
  if (o.deliveryStatus === "ASSIGNED") return { key: "collecting", label: "Ready · driver coming", tone: "info", live: true };
  if (o.deliveryStatus === "WAITING") return { key: "ready", label: "Ready · needs a driver", tone: "warn", live: true };
  if (o.readyAt) return { key: "ready", label: "Ready to collect", tone: "warn" };
  if (o.weighPending) return { key: "toweigh", label: "To weigh", tone: "warn", live: true };
  if (o.completedAt && now.getTime() - new Date(o.completedAt).getTime() > STALE_MS) return { key: "old", label: "Picked up", tone: "neutral" };
  return { key: "washing", label: "In the wash", tone: "info" };
}

/** The Orders page filters: what's with drivers, in the wash, ready or out, and finished. */
export const STAGE_FILTERS: { key: string; label: string; stages: Stage[] }[] = [
  { key: "waiting", label: "Awaiting driver", stages: ["waiting"] },
  { key: "enroute", label: "Driver en route", stages: ["enroute"] },
  { key: "washing", label: "In the wash", stages: ["toweigh", "washing"] },
  { key: "ready", label: "Ready / out", stages: ["ready", "collecting", "out"] },
  { key: "done", label: "Done", stages: ["delivered", "collected", "old"] },
];
