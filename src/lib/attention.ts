// "Needs attention" on the manager's live board: everything that's going wrong right now, with what to do about it
// and where, worked out from data the dashboard already has. A manager who never opens the deeper pages can run the
// day from this list. Pure, so it's tested.
import { isLate } from "./turnaround";
import type { Device, Driver, Order } from "./types";

export type AttentionLevel = "critical" | "warn" | "info";
export type Attention = {
  key: string;
  level: AttentionLevel;
  title: string; // what's wrong, in one line
  fix: string; // what to do about it
  href: string; // where it's fixed
  action: string; // the button
};

export type AttentionInput = {
  now: Date;
  orders: Order[];
  devices: Device[];
  drivers: Driver[];
  lowStock?: { name: string }[]; // Pro: supplies under their alert level
  business: { upiId?: string; storeAddress?: string; storeLocated: boolean; delivers: boolean };
  plan: { state: "TRIAL" | "ACTIVE" | "EXPIRED" | "SUSPENDED"; daysLeft?: number };
};

const MIN = 60_000;
const DAY = 86_400_000;
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const s = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const orderHref = (o: Order) => `/admin/orders/${encodeURIComponent(o.id)}`;
// one order: open it; several: the list
const hrefFor = (list: Order[], fallback: string) => (list.length === 1 ? orderHref(list[0]) : fallback);

const RANK: Record<AttentionLevel, number> = { critical: 0, warn: 1, info: 2 };

export function attentionItems(i: AttentionInput): Attention[] {
  const t = i.now.getTime();
  const age = (iso?: string) => (iso ? t - new Date(iso).getTime() : 0);
  const items: Attention[] = [];
  const online = i.drivers.filter((d) => d.telegramChatId && d.status !== "OFFLINE");

  // money can't come in
  if (!i.business.upiId) {
    items.push({
      key: "upi",
      level: "critical",
      title: "Customers can't pay you yet",
      fix: "Add your UPI ID so every bill shows a pay button and QR code.",
      href: "/admin/business",
      action: "Add UPI ID",
    });
  }

  // drivers
  const connected = i.drivers.filter((d) => d.telegramChatId);
  const openPickups = i.orders.filter((o) => o.status === "PENDING" || o.status === "ACCEPTED");
  const openDeliveries = i.orders.filter((o) => o.deliveryStatus === "WAITING" || o.deliveryStatus === "ASSIGNED" || o.deliveryStatus === "OUT");
  if (!connected.length) {
    items.push({
      key: "no-drivers",
      level: "critical",
      title: i.drivers.length ? "No driver has connected to the driver bot" : "You haven't added a driver yet",
      fix: i.drivers.length
        ? "Ask each driver to open Toss Handy on Telegram and share their phone number."
        : "Add a driver with their mobile number; they connect by sharing it with the Toss Handy bot.",
      href: "/admin/fleet",
      action: i.drivers.length ? "See drivers" : "Add a driver",
    });
  } else if (!online.length && (openPickups.some((o) => !o.driverId) || openDeliveries.some((o) => o.deliveryStatus === "WAITING"))) {
    items.push({
      key: "offline",
      level: "critical",
      title: "Work is waiting but no driver is online",
      fix: "Ask a driver to tap 🟢 Online in Toss Handy. Waiting pickups and deliveries go to them straight away.",
      href: "/admin/fleet",
      action: "See drivers",
    });
  }

  // pickups nobody has taken
  const stuck = i.orders.filter((o) => o.status === "PENDING" && !o.driverId && age(o.createdAt) > 15 * MIN);
  if (stuck.length) {
    items.push({
      key: "stuck",
      level: "critical",
      title: `${s(stuck.length, "pickup")} waiting over 15 minutes for a driver`,
      fix: "Open it and assign a driver yourself, or tap Auto-assign.",
      href: hrefFor(stuck, "/admin/orders?status=PENDING"),
      action: stuck.length === 1 ? "Assign a driver" : "See pickups",
    });
  }

  // late against the promise
  const late = i.orders.filter((o) => isLate(o, i.now));
  if (late.length) {
    items.push({
      key: "late",
      level: "critical",
      title: `${s(late.length, "order")} past the promised time`,
      fix: "Finish them first, then tap Mark ready: the customer is told and it goes out for delivery.",
      href: hrefFor(late, "/admin#late"),
      action: late.length === 1 ? "Open order" : "See late orders",
    });
  }

  // deliveries back to customers
  const missed = openDeliveries.filter((o) => o.deliveryStatus === "WAITING" && (o.deliveryAttempts ?? 0) > 0);
  if (missed.length) {
    items.push({
      key: "missed",
      level: "warn",
      title: `${s(missed.length, "customer")} wasn't home for delivery`,
      fix: "Call them to agree a time, then tap Try delivering again on the order.",
      href: hrefFor(missed, "/admin#deliveries"),
      action: missed.length === 1 ? "Open order" : "See deliveries",
    });
  }
  const waitingDelivery = openDeliveries.filter((o) => o.deliveryStatus === "WAITING" && !(o.deliveryAttempts ?? 0) && age(o.readyAt) > 30 * MIN);
  if (waitingDelivery.length) {
    items.push({
      key: "delivery-wait",
      level: "warn",
      title: `${s(waitingDelivery.length, "ready order")} waiting over 30 minutes for a delivery driver`,
      fix: "Send it to a driver from the order page, or ask a driver to come online.",
      href: hrefFor(waitingDelivery, "/admin#deliveries"),
      action: waitingDelivery.length === 1 ? "Send it" : "See deliveries",
    });
  }

  // money
  const toConfirm = i.orders.filter((o) => o.paymentStatus === "PENDING");
  if (toConfirm.length) {
    const cash = toConfirm.filter((o) => o.paymentMethod === "CASH").length;
    items.push({
      key: "confirm",
      level: "warn",
      title: `${s(toConfirm.length, "payment")} to confirm (${inr(toConfirm.reduce((a, o) => a + o.amountDue, 0))})`,
      fix: cash ? "Count the cash from drivers and check UPI references in your UPI app, then tap Confirm." : "Check each UPI reference in your UPI app, then tap Confirm.",
      href: "/admin/payments",
      action: "Confirm payments",
    });
  }
  const overdue = i.orders.filter(
    (o) => o.status === "COMPLETED" && o.paymentStatus === "UNPAID" && !o.accountId && o.amountDue > 0 && age(o.completedAt ?? o.createdAt) > 7 * DAY,
  );
  if (overdue.length) {
    items.push({
      key: "overdue",
      level: "warn",
      title: `${inr(overdue.reduce((a, o) => a + o.amountDue, 0))} unpaid for over a week`,
      fix: `${s(overdue.length, "bill")} from ${s(new Set(overdue.map((o) => o.customerId ?? o.deviceId)).size, "customer")}. Remind them, or collect cash at the next delivery.`,
      href: "/admin/payments",
      action: "See unpaid",
    });
  }

  // stock (Pro)
  if (i.lowStock?.length) {
    items.push({
      key: "stock",
      level: "warn",
      title: `Running low: ${i.lowStock.map((x) => x.name).slice(0, 3).join(", ")}${i.lowStock.length > 3 ? "…" : ""}`,
      fix: "Reorder now: the Supplies page has a one-tap WhatsApp message for your supplier.",
      href: "/admin/stock",
      action: "Reorder",
    });
  }

  // baskets
  const quiet = i.devices.filter((d) => d.lastSeenAt && age(d.lastSeenAt) > DAY);
  if (quiet.length) {
    items.push({
      key: "baskets",
      level: "info",
      title: `${s(quiet.length, "basket")} offline for over a day`,
      fix: "Ask the customer to check the basket is plugged in and on Wi-Fi. Its pickups can't come in until it's back.",
      href: "/admin/fleet",
      action: "See baskets",
    });
  }

  // setup
  if (!i.business.storeAddress || !i.business.storeLocated) {
    items.push({
      key: "store",
      level: "info",
      title: i.business.storeAddress ? "Your store isn't on the map" : "Add your store address",
      fix: i.business.delivers
        ? "Driver routes and deliveries start and end at the store. Add the area and city so it can be found."
        : "Driver routes end at the store. Add the area and city so it can be found.",
      href: "/admin/business",
      action: "Fix address",
    });
  }

  // plan
  if (i.plan.state === "TRIAL" && (i.plan.daysLeft ?? 99) <= 3) {
    items.push({
      key: "trial",
      level: "info",
      title: `Your Pro trial ends in ${s(i.plan.daysLeft ?? 0, "day")}`,
      fix: "Subscribe to keep Toss AI, profit, driver pay, supplies, ratings and more. Pickups keep working either way.",
      href: "/admin/billing",
      action: "Keep Pro",
    });
  }

  return items.sort((a, b) => RANK[a.level] - RANK[b.level]);
}
