import "server-only";
import { attentionItems } from "../attention";
import {
  getCustomer,
  getCustomerCredit,
  getDeviceForCustomer,
  getTenantById,
  listDevices,
  listDrivers,
  listOrders,
  listOrdersForCustomer,
  listSubscriptionPayments,
  listSupplies,
  listTenants,
  now,
} from "../data";
import { formatDateTime, formatINR, formatKg, timeAgo } from "../format";
import { planState, tierOf } from "../plan";
import type { Session } from "../session";
import type { Driver, Order } from "../types";
import { nowText, type Intent } from "./intents";

// What the assistant does for each request. Every read goes through the signed-in user's own database client, so
// row-level security decides what they see: a customer only their own pickups, a manager only their business.
// Replies are built here from the data, word for word, never by the AI, so numbers are always exact and
// personal details (names, phones, addresses, locations) never reach the AI service.

export type AssistantReply = {
  text: string;
  rows?: [string, string][];
  links?: { label: string; href: string; external?: boolean }[];
  action?: { type: "theme"; mode: "dark" | "light" | "toggle" | "status" } | { type: "password"; newPassword?: string } | { type: "navigate"; href: string };
  chips?: string[];
  /** the corrected or rephrased question that was answered ("Did you mean: …") */
  understood?: string;
};

const STATUS: Record<Order["status"], string> = {
  PENDING: "waiting for a driver",
  ACCEPTED: "driver on the way",
  COMPLETED: "picked up",
  CANCELLED: "cancelled",
};
const DELIVERY: Record<NonNullable<Order["deliveryStatus"]>, string> = {
  WAITING: "ready, waiting for a delivery driver",
  ASSIGNED: "delivery driver assigned",
  OUT: "out for delivery",
  DELIVERED: "delivered",
  COLLECTED: "collected from the store",
};
const DRIVER_STATUS: Record<Driver["status"], string> = { AVAILABLE: "available", ON_JOB: "on a job", OFFLINE: "offline" };
const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const label = (o: Order) => `#${o.deviceOrderId}`;
const statusOf = (o: Order) => (o.deliveryStatus ? DELIVERY[o.deliveryStatus] : STATUS[o.status]);
const unpaid = (o: Order) => o.status === "COMPLETED" && o.paymentStatus === "UNPAID";
// midnight in India, as an instant
function startOfTodayIST(at = now()) {
  const ist = new Date(at.getTime() + 330 * 60_000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 330 * 60_000);
}

export const CHIPS = {
  CUSTOMER: ["How full is my basket?", "My active pickup", "What do I owe?", "My credit", "Switch to dark mode"],
  MANAGER: ["Today's summary", "What needs attention?", "Where are my drivers?", "Unpaid bills", "Switch to dark mode"],
  OWNER: ["Platform summary", "Pending subscription payments", "Open basket credits", "Switch to dark mode"],
} as const;

export async function runIntent(intent: Intent, session: Session): Promise<AssistantReply> {
  switch (intent.tool) {
    case "theme":
      // the browser knows the current theme, so it writes the final words (and says "already in dark mode")
      return { text: "", action: { type: "theme", mode: intent.mode } };
    case "now":
      return { text: nowText(now()) };
    case "password":
      return { text: "Let's change it here. Your passwords stay on this page; I never see them.", action: { type: "password", newPassword: intent.newPassword } };
    case "go":
      return { text: `Opening ${intent.label}.`, action: { type: "navigate", href: intent.href } };
    case "help":
      return { text: intent.question };
  }
  if (session.role === "CUSTOMER") return customerTool(intent, session);
  if (session.role === "MANAGER") return managerTool(intent, session);
  return ownerTool(intent);
}

// ---------- customers ----------
async function customerTool(intent: Intent, session: Session): Promise<AssistantReply> {
  const orders = (await listOrdersForCustomer(session.userId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active = orders.filter((o) => o.status === "PENDING" || o.status === "ACCEPTED" || (o.deliveryStatus && o.deliveryStatus !== "DELIVERED" && o.deliveryStatus !== "COLLECTED"));
  const owed = orders.filter(unpaid);
  const owedSum = owed.reduce((s, o) => s + o.amountDue, 0);

  if (intent.tool === "basket") {
    const device = await getDeviceForCustomer(session.userId);
    if (!device) return { text: "You don't have a basket linked to your account yet.", links: [{ label: "Overview", href: "/app" }] };
    const w = device.lastWeightKg ?? 0, target = device.targetKg ?? 0;
    const pct = target > 0 ? Math.min(100, Math.round((w / target) * 100)) : undefined;
    return {
      text: pct !== undefined ? `Your basket is ${pct}% full: ${formatKg(w)} of ${formatKg(target)}. It books a pickup by itself at ${formatKg(target)}.` : `Your basket reads ${formatKg(w)}.`,
      rows: [
        ["Weight", formatKg(w)],
        ...(target ? ([["Pickup at", formatKg(target)]] as [string, string][]) : []),
        ["Last reading", device.lastSeenAt ? timeAgo(device.lastSeenAt, now()) : "never"],
      ],
      chips: ["My active pickup", "What do I owe?"],
    };
  }
  if (intent.tool === "credit") {
    const c = await getCustomerCredit(session.userId);
    if (!c) return { text: "You don't have any basket credit." };
    return {
      text: c.expired ? `Your basket credit expired on ${formatDateTime(c.expiresAt)}.` : `You have ${formatINR(c.left)} of laundry credit left. It comes off your pickups automatically.`,
      rows: [
        ["Left", formatINR(c.left)],
        ["Used", formatINR(c.used)],
        ["Expires", formatDateTime(c.expiresAt)],
      ],
    };
  }
  if (intent.tool === "order") {
    const hit = orders.filter((o) => o.deviceOrderId === intent.number);
    if (!hit.length) return { text: `I can't find pickup #${intent.number} on your account.`, links: [{ label: "Order history", href: "/app/orders" }] };
    return orderReply(hit[0], "/app/orders");
  }
  if (intent.tool === "orders") {
    if (intent.filter === "unpaid") {
      return owed.length
        ? { text: `You owe ${formatINR(owedSum)} for ${n(owed.length, "pickup")}.`, rows: owed.slice(0, 6).map((o) => [label(o), formatINR(o.amountDue)]), links: [{ label: "Pay now", href: "/app" }] }
        : { text: "You're all paid up. Nothing to pay." };
    }
    const list = intent.filter === "active" ? active : orders.slice(0, 5);
    if (!list.length) return { text: intent.filter === "active" ? "No pickup is on the go right now." : "You haven't had any pickups yet." };
    return {
      text: intent.filter === "active" ? `${n(list.length, "pickup")} on the go.` : "Your recent pickups:",
      rows: list.slice(0, 6).map((o) => [label(o), `${statusOf(o)} · ${formatKg(o.weightKg)}`]),
      links: [{ label: "Order history", href: "/app/orders" }],
    };
  }
  // overview
  const [customer, device, credit] = await Promise.all([getCustomer(session.userId), getDeviceForCustomer(session.userId), getCustomerCredit(session.userId)]);
  const tenant = customer?.tenantId ? await getTenantById(customer.tenantId) : undefined;
  const rows: [string, string][] = [];
  if (tenant) rows.push(["Your laundry", tenant.name]);
  if (device) rows.push(["Basket", device.targetKg ? `${formatKg(device.lastWeightKg ?? 0)} of ${formatKg(device.targetKg)}` : formatKg(device.lastWeightKg ?? 0)]);
  rows.push(["On the go", active.length ? active.map((o) => `${label(o)} ${statusOf(o)}`).join(", ") : "nothing"]);
  rows.push(["To pay", owedSum ? formatINR(owedSum) : "nothing"]);
  if (credit && !credit.expired) rows.push(["Credit left", formatINR(credit.left)]);
  rows.push(["Pickups so far", String(orders.filter((o) => o.status === "COMPLETED").length)]);
  return { text: "Here's where everything stands:", rows, chips: ["How full is my basket?", "My active pickup", "What do I owe?"] };
}

// ---------- laundry managers ----------
async function managerTool(intent: Intent, session: Session): Promise<AssistantReply> {
  if (intent.tool === "driver" || intent.tool === "drivers") {
    const [drivers, orders] = await Promise.all([listDrivers(), listOrders()]);
    const jobs = (d: Driver) =>
      orders.filter((o) => (o.driverId === d.telegramChatId && (o.status === "PENDING" || o.status === "ACCEPTED")) || (o.deliveryDriverId === d.telegramChatId && (o.deliveryStatus === "ASSIGNED" || o.deliveryStatus === "OUT")));
    if (intent.tool === "drivers") {
      if (!drivers.length) return { text: "You haven't added any drivers yet.", links: [{ label: "Fleet", href: "/admin/fleet" }] };
      return {
        text: `${n(drivers.filter((d) => d.status !== "OFFLINE").length, "driver")} on duty out of ${drivers.length}.`,
        rows: drivers.map((d) => [d.name, `${DRIVER_STATUS[d.status]} · ${n(jobs(d).length, "job")}${d.locationAt ? ` · seen ${timeAgo(d.locationAt, now())}` : ""}`]),
        links: [{ label: "Fleet", href: "/admin/fleet" }],
        chips: drivers.slice(0, 3).map((d) => `Where is ${d.name.split(" ")[0]}?`),
      };
    }
    const want = intent.name.toLowerCase();
    const match =
      drivers.find((d) => d.name.toLowerCase() === want) ??
      drivers.find((d) => d.name.toLowerCase().split(/\s+/).some((p) => p === want)) ??
      drivers.find((d) => d.name.toLowerCase().startsWith(want)) ??
      drivers.find((d) => d.name.toLowerCase().includes(want));
    if (!match) {
      return { text: `I can't find a driver called "${intent.name}".`, rows: drivers.slice(0, 8).map((d) => [d.name, DRIVER_STATUS[d.status]]), links: [{ label: "Fleet", href: "/admin/fleet" }] };
    }
    const open = jobs(match);
    const rows: [string, string][] = [
      ["Status", DRIVER_STATUS[match.status]],
      ["Jobs now", open.length ? open.map(label).join(", ") : "none"],
    ];
    if (!match.location) {
      return {
        text: `${match.name} hasn't shared a location yet. They can share live location with the Toss Handy bot.`,
        rows,
        links: [{ label: "Fleet", href: "/admin/fleet" }],
      };
    }
    rows.unshift(["Last location", match.locationAt ? `${timeAgo(match.locationAt, now())} (${formatDateTime(match.locationAt)})` : "time unknown"]);
    const stale = match.locationAt ? now().getTime() - new Date(match.locationAt).getTime() > 30 * 60_000 : true;
    return {
      text: stale ? `${match.name}'s last shared location is from ${match.locationAt ? timeAgo(match.locationAt, now()) : "a while ago"}, so they may have moved since.` : `Here's where ${match.name} is now:`,
      rows,
      links: [
        { label: "Open in Google Maps", href: `https://www.google.com/maps?q=${match.location.lat},${match.location.lng}`, external: true },
        { label: "Fleet", href: "/admin/fleet" },
      ],
    };
  }

  const [orders, drivers] = await Promise.all([listOrders(), listDrivers()]);
  const driverName = (chatId?: string) => (chatId ? drivers.find((d) => d.telegramChatId === chatId)?.name : undefined);
  const open = (o: Order) => `/admin/orders/${encodeURIComponent(o.id)}`;

  if (intent.tool === "order") {
    const hit = orders.filter((o) => o.deviceOrderId === intent.number);
    if (!hit.length) return { text: `I can't find order #${intent.number}.`, links: [{ label: "Orders", href: "/admin/orders" }] };
    if (hit.length > 1) return { text: `${hit.length} baskets have an order #${intent.number}:`, rows: hit.map((o) => [label(o), `${statusOf(o)} · ${formatDateTime(o.createdAt)}`]), links: hit.slice(0, 3).map((o) => ({ label: `Open ${label(o)} (${formatDateTime(o.createdAt)})`, href: open(o) })) };
    const o = hit[0];
    const r = orderReply(o, open(o));
    const name = driverName(o.driverId);
    if (name) r.rows!.splice(1, 0, ["Driver", name]);
    return r;
  }
  if (intent.tool === "orders") {
    const pick: Record<typeof intent.filter, (o: Order) => boolean> = {
      active: (o) => o.status === "PENDING" || o.status === "ACCEPTED",
      waiting: (o) => o.status === "PENDING" && !o.driverId,
      unpaid,
      recent: () => true,
      delivery: (o) => o.deliveryStatus === "WAITING" || o.deliveryStatus === "ASSIGNED" || o.deliveryStatus === "OUT",
    };
    const list = orders.filter(pick[intent.filter]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const what = { active: "on the go", waiting: "waiting for a driver", unpaid: "unpaid", recent: "recent", delivery: "on the way back to customers" }[intent.filter];
    if (!list.length) return { text: `Nothing ${what} right now.` };
    const sum = intent.filter === "unpaid" ? ` worth ${formatINR(list.reduce((s, o) => s + o.amountDue, 0))}` : "";
    return {
      text: `${n(list.length, "order")} ${what}${sum}.`,
      rows: list.slice(0, 8).map((o) => [label(o), intent.filter === "unpaid" ? formatINR(o.amountDue) : `${statusOf(o)}${driverName(o.driverId) ? ` · ${driverName(o.driverId)}` : ""}`]),
      links: [{ label: intent.filter === "unpaid" ? "Payments" : "Orders", href: intent.filter === "unpaid" ? "/admin/payments" : "/admin/orders" }],
    };
  }

  const tenant = await getTenantById(session.tenantId);
  if (!tenant) return { text: "This account isn't linked to a business yet." };
  const plan = planState(tenant);
  const alerts = async () => {
    const pro = tierOf(plan.state) === "PRO";
    const [devices, supplies] = await Promise.all([listDevices(), pro ? listSupplies() : Promise.resolve([])]);
    return attentionItems({
      now: now(),
      orders,
      devices,
      drivers,
      lowStock: supplies.filter((s) => s.stock <= s.lowAt),
      business: { upiId: tenant.upiId, storeAddress: tenant.storeAddress, storeLocated: !!tenant.storeLocated, delivers: tenant.delivers },
      plan: { state: plan.state, daysLeft: plan.daysLeft },
    });
  };

  if (intent.tool === "attention") {
    const list = await alerts();
    if (!list.length) return { text: "Nothing needs you right now. All clear." };
    return { text: `${n(list.length, "thing")} need${list.length === 1 ? "s" : ""} you:`, rows: list.slice(0, 6).map((a) => [a.title, a.fix]), links: list.slice(0, 3).map((a) => ({ label: a.action, href: a.href })) };
  }

  // overview: today at a glance
  const since = startOfTodayIST();
  const today = orders.filter((o) => new Date(o.createdAt) >= since);
  const doneToday = orders.filter((o) => o.status === "COMPLETED" && o.completedAt && new Date(o.completedAt) >= since);
  const owed = orders.filter(unpaid);
  const list = await alerts();
  return {
    text: `${tenant.name}, today so far:`,
    rows: [
      ["New pickups", String(today.length)],
      ["Picked up today", `${doneToday.length} · ${formatINR(doneToday.reduce((s, o) => s + (o.amountGross ?? o.amountDue), 0))}`],
      ["On the go", String(orders.filter((o) => o.status === "PENDING" || o.status === "ACCEPTED").length)],
      ["Waiting for a driver", String(orders.filter((o) => o.status === "PENDING" && !o.driverId).length)],
      ["Out for delivery", String(orders.filter((o) => o.deliveryStatus === "OUT").length)],
      ["Unpaid", owed.length ? `${owed.length} · ${formatINR(owed.reduce((s, o) => s + o.amountDue, 0))}` : "none"],
      ["Drivers on duty", `${drivers.filter((d) => d.status !== "OFFLINE").length} of ${drivers.length}`],
      ["Needs attention", list.length ? n(list.length, "item") : "nothing"],
      ["Plan", plan.state === "TRIAL" && plan.daysLeft !== undefined ? `trial, ${n(plan.daysLeft, "day")} left` : plan.state.toLowerCase()],
    ],
    links: [{ label: "Live board", href: "/admin" }],
    chips: ["What needs attention?", "Where are my drivers?", "Unpaid bills"],
  };
}

// ---------- the Toss owner ----------
async function ownerTool(intent: Intent): Promise<AssistantReply> {
  const [tenants, pending] = await Promise.all([listTenants(), listSubscriptionPayments({ status: "PENDING" })]);
  if (intent.tool === "orders" && intent.filter === "unpaid") {
    if (!pending.length) return { text: "No subscription payments are waiting for you." };
    return {
      text: `${n(pending.length, "subscription payment")} to check:`,
      rows: pending.slice(0, 8).map((p) => [tenants.find((t) => t.id === p.tenantId)?.name ?? "A business", formatINR(p.amount)]),
      links: [{ label: "Subscription payments", href: "/owner/payments" }],
    };
  }
  const states = tenants.map((t) => planState(t).state);
  const count = (s: string) => states.filter((x) => x === s).length;
  return {
    text: "Toss right now:",
    rows: [
      ["Businesses", String(tenants.length)],
      ["Paying", String(count("ACTIVE"))],
      ["On trial", String(count("TRIAL"))],
      ["Expired", String(count("EXPIRED"))],
      ["Suspended", String(count("SUSPENDED"))],
      ["Payments to check", pending.length ? `${pending.length} · ${formatINR(pending.reduce((s, p) => s + p.amount, 0))}` : "none"],
    ],
    links: [{ label: "Businesses", href: "/owner" }, ...(pending.length ? [{ label: "Check payments", href: "/owner/payments" }] : [])],
    chips: ["Pending subscription payments", "Open basket credits"],
  };
}

function orderReply(o: Order, href: string): AssistantReply {
  return {
    text: `Order ${label(o)} is ${statusOf(o)}.`,
    rows: [
      ["Status", statusOf(o)],
      ["Weight", formatKg(o.weightKg)],
      ["Amount", formatINR(o.amountDue)],
      ["Payment", o.paymentStatus === "PAID" ? "paid" : o.paymentStatus === "UNPAID" ? (o.status === "COMPLETED" ? "unpaid" : "after pickup") : o.paymentStatus.toLowerCase()],
      ["Placed", formatDateTime(o.createdAt)],
    ],
    links: [{ label: `Open ${label(o)}`, href }],
  };
}
