import "server-only";
import { revalidatePath } from "next/cache";
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
import { formatDate, timeAgo } from "../format";
import { formatterFor, moneyIn, regionOf, type Formatter } from "../region-format";
import { planState, tierOf } from "../plan";
import type { Session } from "../session";
import type { Driver, Order, Tenant } from "../types";
import { endTrialNow, extendTrialBy } from "../trial";
import { geminiEnabled, geminiJson } from "../ai/gemini";
import { ABOUT_TOSS } from "./about";
import { customerSnapshot, factSheet, managerSnapshot, ownerSnapshot, type Snapshot } from "./analyze";
import { profitReport } from "../profit-report";
import { nowText, type Intent, type Period } from "./intents";
import { paidOnline } from "../pay-methods";
import { countryOf } from "../regions";
import { realBaskets } from "../rounds";
import { driverRouteKm } from "../driver-routes";
import { supabaseAdmin } from "../supabase/admin";
import { getLocale } from "../i18n/server";

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
    case "analyze":
      return analyze(intent.question, session);
  }
  if (session.role === "CUSTOMER") return customerTool(intent, session);
  if (session.role === "MANAGER") return managerTool(intent, session);
  return ownerTool(intent);
}

// ---------- periods ("this week" = since Monday, India time) ----------
const IST = 330 * 60_000;
function istMidnight(at: Date, daysBack = 0) {
  const d = new Date(at.getTime() + IST);
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - IST - daysBack * 86_400_000);
}
export function periodRange(p: Period, at: Date): { from: Date; to: Date; label: string } {
  const today = istMidnight(at);
  const dow = (new Date(at.getTime() + IST).getUTCDay() + 6) % 7; // Monday = 0
  const ist = new Date(at.getTime() + IST);
  const monthStart = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST);
  switch (p.key) {
    case "today":
      return { from: today, to: at, label: "today" };
    case "yesterday":
      return { from: istMidnight(at, 1), to: today, label: "yesterday" };
    case "week":
      return { from: istMidnight(at, dow), to: at, label: "this week" };
    case "lastweek":
      return { from: istMidnight(at, dow + 7), to: istMidnight(at, dow), label: "last week" };
    case "month":
      return { from: monthStart, to: at, label: "this month" };
    case "lastmonth":
      return { from: new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - 1, 1) - IST), to: monthStart, label: "last month" };
    default:
      return { from: new Date(at.getTime() - (p.days ?? 30) * 86_400_000), to: at, label: `the last ${p.days ?? 30} days` };
  }
}

// ---------- customers ----------
// Money and weights in the business's own currency and unit: the manager's business, or the laundry a customer joined.
async function formatFor(session: Session): Promise<Formatter> {
  const tenantId = session.role === "MANAGER" ? session.tenantId : (await getCustomer(session.userId))?.tenantId;
  return formatterFor(regionOf(tenantId ? await getTenantById(tenantId) : undefined));
}

async function customerTool(intent: Intent, session: Session): Promise<AssistantReply> {
  const fmt = await formatFor(session);
  const orders = (await listOrdersForCustomer(session.userId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active = orders.filter((o) => o.status === "PENDING" || o.status === "ACCEPTED" || (o.deliveryStatus && o.deliveryStatus !== "DELIVERED" && o.deliveryStatus !== "COLLECTED"));
  const owed = orders.filter(unpaid);
  const owedSum = owed.reduce((s, o) => s + o.amountDue, 0);

  if (intent.tool === "distance") {
    const { from, to, label } = periodRange(intent.period, now());
    const [drivers, orders, tenant] = await Promise.all([listDrivers(), listOrders(), getTenantById(session.tenantId)]);
    if (!tenant) return { text: "This account isn't linked to a business yet." };
    if (!drivers.length) return { text: "You haven't added any drivers yet.", links: [{ label: "Drivers", href: "/admin/fleet" }] };
    const km = await driverRouteKm(orders, tenant, from.toISOString(), to.toISOString());
    const named = namedIn(drivers, intent.who);
    const list = named.length ? named : drivers;
    const of = (d: Driver) => (d.telegramChatId ? (km.get(d.telegramChatId) ?? 0) : 0);
    const rows: [string, string][] = list.map((d) => [d.name, `≈ ${of(d)} km`]);
    const how = "Counted stop to stop from where they started: pickups, the store and deliveries. Detours don't count.";
    if (named.length === 1) {
      const d = named[0];
      return {
        text: of(d) ? `${d.name} drove about ${of(d)} km on jobs ${label}. ${how}` : `${d.name} has no finished pickups or deliveries ${label}, so 0 km.`,
        rows: [["Distance", `≈ ${of(d)} km`]],
        links: [{ label: "Driver pay", href: "/admin/driver-pay" }],
      };
    }
    const total = Math.round(list.reduce((s, d) => s + of(d), 0) * 10) / 10;
    return { text: `Your drivers drove about ${total} km on jobs ${label}. ${how}`, rows, links: [{ label: "Fleet", href: "/admin/fleet" }] };
  }

  if (intent.tool === "area") {
    const tenant = await getTenantById(session.tenantId);
    if (!tenant) return { text: "This account isn't linked to a business yet." };
    const cur = tenant.serviceRadiusKm;
    const links = [{ label: "Business details", href: "/admin/business" }];
    if (intent.op === "show") {
      return {
        text: `You pick up within ${cur} km of your store.${tenant.storeLat == null ? " Place your store on the map under Business details so this works." : ""}`,
        links,
        chips: [cur < 20 ? "Increase my area by 1 km" : "", cur > 1 ? "Decrease my area by 1 km" : ""].filter(Boolean),
      };
    }
    const next = intent.op === "change" ? cur + (intent.km ?? 0) : (intent.km ?? cur);
    if (next < 1 || next > 20) return { text: `The pickup area can be 1 to 20 km. It's ${cur} km now.`, links };
    if (next === cur) return { text: `Your pickup area is already ${cur} km.`, links };
    // not in the manager's column grants: written here, after the manager check, like Business details does
    const { error } = await supabaseAdmin().from("tenants").update({ service_radius_km: next }).eq("id", session.tenantId);
    if (error) return { text: "I couldn't change it just now. Try again, or change it under Business details.", links };
    revalidatePath("/admin", "layout");
    revalidatePath("/laundries");
    return { text: `Done. You now pick up within ${next} km of your store (it was ${cur} km).`, links, chips: [`Set my area to ${cur} km`] };
  }

  if (intent.tool === "money") {
    const { from, to, label } = periodRange(intent.period, now());
    const done = orders.filter((o) => o.status === "COMPLETED" && new Date(o.completedAt ?? o.createdAt) >= from && new Date(o.completedAt ?? o.createdAt) < to);
    const spent = done.reduce((s, o) => s + o.amountDue, 0);
    const credit = done.reduce((s, o) => s + (o.creditApplied ?? 0), 0);
    if (!done.length) return { text: `No pickups ${label}, so nothing spent.` };
    return {
      text: `You spent ${fmt.money(spent)} on ${n(done.length, "pickup")} ${label}.`,
      rows: [
        ["Spent", fmt.money(spent)],
        ["Pickups", String(done.length)],
        ["Laundry", fmt.weight(done.reduce((s, o) => s + o.weightKg, 0))],
        ...(credit ? ([["Credit used", fmt.money(credit)]] as [string, string][]) : []),
      ],
      links: [{ label: "Order history", href: "/app/orders" }],
    };
  }
  if (intent.tool === "basket") {
    const device = await getDeviceForCustomer(session.userId);
    if (!device) return { text: "You don't have a basket linked to your account yet.", links: [{ label: "Overview", href: "/app" }] };
    const w = device.lastWeightKg ?? 0, target = device.targetKg ?? 0;
    const pct = target > 0 ? Math.min(100, Math.round((w / target) * 100)) : undefined;
    return {
      text: pct !== undefined ? `Your basket is ${pct}% full: ${fmt.weight(w)} of ${fmt.weight(target)}. It books a pickup by itself at ${fmt.weight(target)}.` : `Your basket reads ${fmt.weight(w)}.`,
      rows: [
        ["Weight", fmt.weight(w)],
        ...(target ? ([["Pickup at", fmt.weight(target)]] as [string, string][]) : []),
        ["Last reading", device.lastSeenAt ? timeAgo(device.lastSeenAt, now()) : "never"],
      ],
      chips: ["My active pickup", "What do I owe?"],
    };
  }
  if (intent.tool === "credit") {
    const c = await getCustomerCredit(session.userId);
    if (!c) return { text: "You don't have any basket credit." };
    return {
      text: c.expired ? `Your basket credit expired on ${fmt.dateTime(c.expiresAt)}.` : `You have ${fmt.money(c.left)} of laundry credit left. It comes off your pickups automatically.`,
      rows: [
        ["Left", fmt.money(c.left)],
        ["Used", fmt.money(c.used)],
        ["Expires", fmt.dateTime(c.expiresAt)],
      ],
    };
  }
  if (intent.tool === "order") {
    const hit = orders.filter((o) => o.deviceOrderId === intent.number);
    if (!hit.length) return { text: `I can't find pickup #${intent.number} on your account.`, links: [{ label: "Order history", href: "/app/orders" }] };
    return orderReply(hit[0], "/app/orders", fmt);
  }
  if (intent.tool === "orders") {
    if (intent.filter === "unpaid") {
      return owed.length
        ? { text: `You owe ${fmt.money(owedSum)} for ${n(owed.length, "pickup")}.`, rows: owed.slice(0, 6).map((o) => [label(o), fmt.money(o.amountDue)]), links: [{ label: "Pay now", href: "/app" }] }
        : { text: "You're all paid up. Nothing to pay." };
    }
    const list = intent.filter === "active" ? active : orders.slice(0, 5);
    if (!list.length) return { text: intent.filter === "active" ? "No pickup is on the go right now." : "You haven't had any pickups yet." };
    return {
      text: intent.filter === "active" ? `${n(list.length, "pickup")} on the go.` : "Your recent pickups:",
      rows: list.slice(0, 6).map((o) => [label(o), `${statusOf(o)} · ${fmt.weight(o.weightKg)}`]),
      links: [{ label: "Order history", href: "/app/orders" }],
    };
  }
  // overview
  const [customer, device, credit] = await Promise.all([getCustomer(session.userId), getDeviceForCustomer(session.userId), getCustomerCredit(session.userId)]);
  const tenant = customer?.tenantId ? await getTenantById(customer.tenantId) : undefined;
  const rows: [string, string][] = [];
  if (tenant) rows.push(["Your laundry", tenant.name]);
  if (device) rows.push(["Basket", device.targetKg ? `${fmt.weight(device.lastWeightKg ?? 0)} of ${fmt.weight(device.targetKg)}` : fmt.weight(device.lastWeightKg ?? 0)]);
  rows.push(["On the go", active.length ? active.map((o) => `${label(o)} ${statusOf(o)}`).join(", ") : "nothing"]);
  rows.push(["To pay", owedSum ? fmt.money(owedSum) : "nothing"]);
  if (credit && !credit.expired) rows.push(["Credit left", fmt.money(credit.left)]);
  rows.push(["Pickups so far", String(orders.filter((o) => o.status === "COMPLETED").length)]);
  return { text: "Here's where everything stands:", rows, chips: ["How full is my basket?", "My active pickup", "What do I owe?"] };
}

// ---------- laundry managers ----------
/** Drivers whose name (or first name) appears as a word in free text: "arpan kahan hai bulao usko" → Arpan. */
function namedIn(drivers: Driver[], text: string): Driver[] {
  const words = new Set(text.toLowerCase().split(/[^a-z\u0900-\u097f]+/).filter(Boolean));
  const full = drivers.filter((d) => text.toLowerCase().includes(d.name.toLowerCase()));
  if (full.length) return full;
  return drivers.filter((d) => d.name.toLowerCase().split(/\s+/).some((p) => p.length > 2 && words.has(p)));
}

// ---------- laundry managers ----------
async function managerTool(intent: Intent, session: Session): Promise<AssistantReply> {
  const fmt = await formatFor(session);
  if (intent.tool === "driver" || intent.tool === "drivers") {
    const [drivers, orders] = await Promise.all([listDrivers(), listOrders()]);
    // a driver's two kinds of job: pickups (clothes to the laundry) and deliveries (clean clothes back)
    const pickupsOf = (d: Driver) => orders.filter((o) => !!d.telegramChatId && o.driverId === d.telegramChatId && (o.status === "PENDING" || o.status === "ACCEPTED"));
    const deliveriesOf = (d: Driver) => orders.filter((o) => !!d.telegramChatId && o.deliveryDriverId === d.telegramChatId && (o.deliveryStatus === "ASSIGNED" || o.deliveryStatus === "OUT"));
    const jobsText = (d: Driver) => {
      const p = pickupsOf(d).length, dl = deliveriesOf(d).length;
      return p + dl === 0 ? "no jobs" : [p && n(p, "pickup"), dl && n(dl, "delivery", "deliveries")].filter(Boolean).join(" + ");
    };
    if (intent.tool === "drivers") {
      if (!drivers.length) return { text: "You haven't added any drivers yet.", links: [{ label: "Fleet", href: "/admin/fleet" }] };
      return {
        text: `${n(drivers.filter((d) => d.status !== "OFFLINE").length, "driver")} on duty out of ${drivers.length}.`,
        rows: drivers.map((d) => [d.name, `${DRIVER_STATUS[d.status]} · ${jobsText(d)}${d.locationAt ? ` · seen ${timeAgo(d.locationAt, now())}` : ""}`]),
        links: [{ label: "Fleet", href: "/admin/fleet" }],
        chips: drivers.slice(0, 3).map((d) => `Where is ${d.name.split(" ")[0]}?`),
      };
    }
    const want = intent.name.toLowerCase();
    const match =
      drivers.find((d) => d.name.toLowerCase() === want) ??
      drivers.find((d) => d.name.toLowerCase().split(/\s+/).some((p) => p === want)) ??
      drivers.find((d) => d.name.toLowerCase().startsWith(want)) ??
      drivers.find((d) => d.name.toLowerCase().includes(want)) ??
      namedIn(drivers, want)[0];
    const call: { label: string; href: string; external?: boolean }[] = match?.phone ? [{ label: `📞 Call ${match.name.split(" ")[0]}`, href: `tel:${match.phone}`, external: true }] : [];
    if (!match) {
      return { text: `I can't find a driver called "${intent.name}".`, rows: drivers.slice(0, 8).map((d) => [d.name, DRIVER_STATUS[d.status]]), links: [{ label: "Fleet", href: "/admin/fleet" }] };
    }
    const ups = pickupsOf(match), downs = deliveriesOf(match);
    const rows: [string, string][] = [
      ["Status", DRIVER_STATUS[match.status]],
      ["Pickups now", ups.length ? ups.map(label).join(", ") : "none"],
      ["Deliveries now", downs.length ? downs.map((o) => `${label(o)} (${DELIVERY[o.deliveryStatus!]})`).join(", ") : "none"],
    ];
    if (!match.location) {
      return {
        text: `${match.name} hasn't shared a location yet. They can share live location with the Toss Handy bot.`,
        rows,
        links: [...call, { label: "Fleet", href: "/admin/fleet" }],
      };
    }
    rows.unshift(["Last location", match.locationAt ? `${timeAgo(match.locationAt, now())} (${fmt.dateTime(match.locationAt)})` : "time unknown"]);
    const stale = match.locationAt ? now().getTime() - new Date(match.locationAt).getTime() > 30 * 60_000 : true;
    return {
      text: stale ? `${match.name}'s last shared location is from ${match.locationAt ? timeAgo(match.locationAt, now()) : "a while ago"}, so they may have moved since.` : `Here's where ${match.name} is now:`,
      rows,
      links: [
        ...call,
        { label: "Open in Google Maps", href: `https://www.google.com/maps?q=${match.location.lat},${match.location.lng}`, external: true },
        { label: "Fleet", href: "/admin/fleet" },
      ],
    };
  }

  if (intent.tool === "money") {
    const { from, to, label } = periodRange(intent.period, now());
    const tenant = await getTenantById(session.tenantId);
    const pro = tenant ? tierOf(planState(tenant).state) === "PRO" : false;
    const r = await profitReport(session.tenantId, from, to);
    if (!r) return { text: "This account isn't linked to a business yet." };
    if (!r.pickups) return { text: `No completed pickups ${label} yet, so no revenue or profit to show.`, links: [{ label: "Profit", href: "/admin/profit" }] };
    const base: [string, string][] = [
      ["Pickups", `${r.pickups} · ${fmt.weight(r.kg)}`],
      ["Revenue", fmt.money(Math.round(r.earned))],
    ];
    if (!pro) {
      return {
        text: `You earned ${fmt.money(Math.round(r.earned))} from ${n(r.pickups, "pickup")} ${label}. Profit after costs is part of Pro.`,
        rows: base,
        links: [{ label: "See Pro", href: "/admin/billing" }],
      };
    }
    return {
      text: `Your profit ${label} is ${fmt.money(Math.round(r.profit))} on ${fmt.money(Math.round(r.earned))} of revenue.`,
      rows: [
        ...base,
        ["Supplies", fmt.money(Math.round(r.supplies))],
        ["Running costs", fmt.money(Math.round(r.other))],
        ["Driver pay", fmt.money(Math.round(r.driver))],
        ["Profit", fmt.money(Math.round(r.profit))],
        ["Profit per kg", r.kg > 0 ? fmt.money(Math.round((r.profit / r.kg) * 100) / 100) : "-"],
      ],
      links: [{ label: "Profit page", href: "/admin/profit" }],
      chips: ["Profit last week", "Profit this month"],
    };
  }

  const [orders, drivers] = await Promise.all([listOrders(), listDrivers()]);
  const driverName = (chatId?: string) => (chatId ? drivers.find((d) => d.telegramChatId === chatId)?.name : undefined);
  const open = (o: Order) => `/admin/orders/${encodeURIComponent(o.id)}`;

  if (intent.tool === "order") {
    const hit = orders.filter((o) => o.deviceOrderId === intent.number);
    if (!hit.length) return { text: `I can't find order #${intent.number}.`, links: [{ label: "Orders", href: "/admin/orders" }] };
    if (hit.length > 1) return { text: `${hit.length} baskets have an order #${intent.number}:`, rows: hit.map((o) => [label(o), `${statusOf(o)} · ${fmt.dateTime(o.createdAt)}`]), links: hit.slice(0, 3).map((o) => ({ label: `Open ${label(o)} (${fmt.dateTime(o.createdAt)})`, href: open(o) })) };
    const o = hit[0];
    const r = orderReply(o, open(o), fmt);
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
    const sum = intent.filter === "unpaid" ? ` worth ${fmt.money(list.reduce((s, o) => s + o.amountDue, 0))}` : "";
    return {
      text: `${n(list.length, "order")} ${what}${sum}.`,
      rows: list.slice(0, 8).map((o) => [label(o), intent.filter === "unpaid" ? fmt.money(o.amountDue) : `${statusOf(o)}${driverName(o.driverId) ? ` · ${driverName(o.driverId)}` : ""}`]),
      links: [{ label: intent.filter === "unpaid" ? "Payments" : "Orders", href: intent.filter === "unpaid" ? "/admin/payments" : "/admin/orders" }],
    };
  }

  const tenant = await getTenantById(session.tenantId);
  if (!tenant) return { text: "This account isn't linked to a business yet." };
  const plan = planState(tenant);
  const alerts = async () => {
    const pro = tierOf(plan.state) === "PRO";
    const [devices, supplies] = await Promise.all([listDevices().then(realBaskets), pro ? listSupplies() : Promise.resolve([])]);
    return attentionItems({
      now: now(),
      orders,
      devices,
      drivers,
      lowStock: supplies.filter((s) => s.stock <= s.lowAt),
      business: { upiId: tenant.upiId, storeAddress: tenant.storeAddress, storeLocated: !!tenant.storeLocated, delivers: tenant.delivers, paidOnline: paidOnline(tenant), india: tenant.currency === "INR", onlineGateway: !!tenant.onlineGateway },
      money: formatterFor(regionOf(tenant)).money,
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
      ["Picked up today", `${doneToday.length} · ${fmt.money(doneToday.reduce((s, o) => s + (o.amountGross ?? o.amountDue), 0))}`],
      ["On the go", String(orders.filter((o) => o.status === "PENDING" || o.status === "ACCEPTED").length)],
      ["Waiting for a driver", String(orders.filter((o) => o.status === "PENDING" && !o.driverId).length)],
      ["Out for delivery", String(orders.filter((o) => o.deliveryStatus === "OUT").length)],
      ["Unpaid", owed.length ? `${owed.length} · ${fmt.money(owed.reduce((s, o) => s + o.amountDue, 0))}` : "none"],
      ["Drivers on duty", `${drivers.filter((d) => d.status !== "OFFLINE").length} of ${drivers.length}`],
      ["Needs attention", list.length ? n(list.length, "item") : "nothing"],
      ["Plan", plan.state === "TRIAL" && plan.daysLeft !== undefined ? `trial, ${n(plan.daysLeft, "day")} left` : plan.state.toLowerCase()],
    ],
    links: [{ label: "Live board", href: "/admin" }],
    chips: ["What needs attention?", "Where are my drivers?", "Unpaid bills"],
  };
}

// ---------- the Toss owner ----------
// "Extend Fresh's trial by 10 days" / "End the trial for B-E2ZRFP". Extending happens straight away; ending asks
// first, with a button that sends the confirmation (with the business ID, so it can't hit the wrong one).
async function trialTool(intent: Extract<Intent, { tool: "trial" }>, tenants: Tenant[]): Promise<AssistantReply> {
  const want = intent.business.toLowerCase();
  const verb = intent.op === "end" ? "End the trial for" : "Extend the trial for";
  const tail = intent.op === "extend" ? ` by ${intent.days} days` : "";
  const byCode = tenants.filter((t) => t.joinCode.toLowerCase() === want);
  const byName = want ? tenants.filter((t) => t.name.toLowerCase().includes(want) || want.includes(t.name.toLowerCase())) : [];
  // no name given ("Extend a trial by 7 days"): always ask which one, even with a single business
  const hits = byCode.length ? byCode : byName;
  if (hits.length !== 1) {
    const choices = (hits.length ? hits : tenants).filter((t) => planState(t).state !== "ACTIVE").slice(0, 4);
    return {
      text: hits.length ? "Which business did you mean?" : want ? `I couldn't find a business called "${intent.business}".` : "Which business?",
      chips: choices.map((t) => `${verb} ${t.name} (${t.joinCode})${tail}`),
    };
  }
  const t = hits[0];
  const p = planState(t);
  if (p.state === "SUSPENDED") return { text: `${t.name} is suspended. Reactivate it on the Businesses page first.`, links: [{ label: "Businesses", href: "/owner" }] };
  if (p.state === "ACTIVE") return { text: `${t.name} is on a paid plan until ${formatDate(p.until!)}, so trial days wouldn't change anything.` };
  try {
    if (intent.op === "extend") {
      const until = await extendTrialBy(t.id, intent.days ?? 7);
      revalidatePath("/owner", "layout");
      return {
        text: `Done: ${t.name}'s free trial now runs until ${formatDate(until)} (${intent.days} more days). I've emailed the manager.`,
        links: [{ label: "Businesses", href: "/owner" }],
      };
    }
    if (p.state !== "TRIAL") return { text: `${t.name} isn't on a trial: it ended on ${formatDate(p.until!)}.` };
    if (!intent.confirmed) {
      return {
        text: `End ${t.name}'s trial now? It drops to Toss Free straight away: pickups and payments keep working, the Pro tools turn off, and the manager gets an email. The trial would otherwise run until ${formatDate(p.until!)}.`,
        chips: [`Yes, end the trial for ${t.name} (${t.joinCode})`],
      };
    }
    await endTrialNow(t.id);
    revalidatePath("/owner", "layout");
    return { text: `Done: ${t.name}'s trial has ended and it's on Toss Free now. I've emailed the manager.`, links: [{ label: "Businesses", href: "/owner" }] };
  } catch (e) {
    return { text: e instanceof Error ? e.message : "Couldn't change the trial." };
  }
}

async function ownerTool(intent: Intent): Promise<AssistantReply> {
  const [tenants, pending] = await Promise.all([listTenants(), listSubscriptionPayments({ status: "PENDING" })]);
  if (intent.tool === "trial") return trialTool(intent, tenants);
  if (intent.tool === "orders" && intent.filter === "unpaid") {
    if (!pending.length) return { text: "No subscription payments are waiting for you." };
    return {
      text: `${n(pending.length, "subscription payment")} to check:`,
      rows: pending.slice(0, 8).map((p) => [tenants.find((t) => t.id === p.tenantId)?.name ?? "A business", moneyIn(p.amount, p.currency)]),
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
      ["Payments to check", pending.length ? `${pending.length}` : "none"],
    ],
    links: [{ label: "Businesses", href: "/owner" }, ...(pending.length ? [{ label: "Check payments", href: "/owner/payments" }] : [])],
    chips: ["Pending subscription payments", "Open basket credits"],
  };
}

function orderReply(o: Order, href: string, fmt: Formatter): AssistantReply {
  return {
    text: `Order ${label(o)} is ${statusOf(o)}.`,
    rows: [
      ["Status", statusOf(o)],
      ["Weight", fmt.weight(o.weightKg)],
      ["Amount", fmt.money(o.amountDue)],
      ["Payment", o.paymentStatus === "PAID" ? "paid" : o.paymentStatus === "UNPAID" ? (o.status === "COMPLETED" ? "unpaid" : "after pickup") : o.paymentStatus.toLowerCase()],
      ["Placed", fmt.dateTime(o.createdAt)],
    ],
    links: [{ label: `Open ${label(o)}`, href }],
  };
}

// ---------- advice from the numbers ----------
// The fact sheets are written in rupees; for a business abroad the amounts are already in its own currency, so
// only the labels change ("(₹)" → "(USD)"), and the AI then talks in that currency.
function inCurrency(snap: Snapshot, currency: string): Snapshot {
  if (currency === "INR") return snap;
  return JSON.parse(JSON.stringify(snap).replace(/\(₹\)/g, `(${currency})`).replace(/₹/g, `${currency} `)) as Snapshot;
}
async function analyze(question: string, session: Session): Promise<AssistantReply> {
  // the site in Hindi: answer in Hindi too, whatever language the question came in
  const hindi = (await getLocale().catch(() => "en")) === "hi";
  let snap: Snapshot;
  let who: string;
  let names: string[] = []; // real names behind "Driver 1, 2 …" / "Business 1, 2 …"
  let label = "Driver";
  if (session.role === "MANAGER") {
    const [orders, drivers, tenant, devices] = await Promise.all([listOrders(), listDrivers(), getTenantById(session.tenantId), listDevices().then(realBaskets).catch(() => [])]);
    if (!tenant) return { text: "This account isn't linked to a business yet." };
    snap = inCurrency(managerSnapshot(orders, drivers, tenant, now()), tenant.currency);
    names = drivers.map((d) => d.name);
    // more of the business, so most questions have their numbers: kilometres, area, plan, baskets
    const t = now();
    const [kmMonth, kmWeek] = await Promise.all([
      driverRouteKm(orders, tenant, periodRange({ key: "month" }, t).from.toISOString()).catch(() => new Map<string, number>()),
      driverRouteKm(orders, tenant, periodRange({ key: "week" }, t).from.toISOString()).catch(() => new Map<string, number>()),
    ]);
    drivers.forEach((d, i) => {
      const key = `Driver ${i + 1}`;
      if (snap.facts[key] != null && d.telegramChatId) {
        snap.facts[key] += `; km driven on jobs this week ≈ ${kmWeek.get(d.telegramChatId) ?? 0}, this month ≈ ${kmMonth.get(d.telegramChatId) ?? 0}; location ${d.locationAt ? `last shared ${timeAgo(d.locationAt, t)}` : "never shared"}; paid ${d.payType === "SALARY" ? "a monthly salary" : "per trip"}`;
      }
    });
    const plan = planState(tenant);
    snap.facts["plan"] = `${plan.state.toLowerCase()}${plan.daysLeft != null ? `, ${plan.daysLeft} days left` : ""}`;
    snap.facts["pickup area (km around the store)"] = tenant.serviceRadiusKm;
    snap.facts["store placed on the map"] = tenant.storeLat != null ? "yes" : "no";
    const online = devices.filter((d) => d.lastSeenAt && t.getTime() - new Date(d.lastSeenAt).getTime() < 15 * 60_000).length;
    snap.facts["smart baskets"] = `${devices.length} in total, ${online} online now`;
    const filled = devices.filter((d) => d.targetKg && d.lastWeightKg != null).map((d) => (d.lastWeightKg! / d.targetKg!) * 100);
    if (filled.length) snap.facts["average basket fill (%)"] = Math.round(filled.reduce((x, y) => x + y, 0) / filled.length);
    snap.facts["customers who ordered in the last 30 days"] = new Set(orders.filter((o) => t.getTime() - new Date(o.createdAt).getTime() < 30 * 86_400_000).map((o) => o.customerId ?? o.deviceId)).size;
    who = `the manager of a laundry business${tenant.country !== "IN" ? ` in ${countryOf(tenant.country).name}` : " in India"}`;
  } else if (session.role === "CUSTOMER") {
    const [orders, customer, credit] = await Promise.all([listOrdersForCustomer(session.userId), getCustomer(session.userId), getCustomerCredit(session.userId)]);
    const tenant = customer?.tenantId ? await getTenantById(customer.tenantId) : undefined;
    snap = inCurrency(customerSnapshot(orders, tenant?.pricePerKg, credit), tenant?.currency ?? "INR");
    if (tenant) {
      snap.facts["laundry turnaround promise (hours)"] = tenant.turnaroundHours;
      snap.facts["laundry delivers back"] = tenant.delivers ? "yes" : "no, collect from the store";
    }
    who = "a customer of a laundry";
  } else {
    const [tenants, orders, pending] = await Promise.all([listTenants(), listOrders(), listSubscriptionPayments({ status: "PENDING" })]);
    const t0 = now().getTime();
    const count = (id: string, from: number, to: number) => orders.filter((o) => o.tenantId === id && t0 - new Date(o.createdAt).getTime() >= from && t0 - new Date(o.createdAt).getTime() < to).length;
    snap = ownerSnapshot(
      tenants.map((t) => ({ name: t.name, state: planState(t).state, orders30: count(t.id, 0, 30 * 86_400_000), ordersPrev30: count(t.id, 30 * 86_400_000, 60 * 86_400_000) })),
      pending.length,
    );
    names = tenants.map((t) => t.name);
    label = "Business";
    who = "the owner of the Toss platform";
  }
  if (!geminiEnabled()) return { text: "I can't answer that right now, but here are the numbers that matter:", rows: snap.rows };
  const alias = aliases(names, label);
  try {
    const { data } = await geminiJson<{ answer: string; uses_numbers: boolean }>({
      system: `You are the assistant inside Toss, a smart laundry service, talking to ${who}. Answer ANY sensible question: about their account, their business, laundry, running a small business, or general knowledge.
For facts about their account use ONLY the numbers below and never invent any; if a number isn't there, say plainly what you can't see and where in the app to look. For advice, give a clear answer first (yes / no when it's a yes-or-no question), the 1-2 numbers that decide it, then one concrete next step. For general questions, answer from general knowledge.
${hindi ? "They use Toss in Hindi: reply in simple, everyday Hindi written in Devanagari, keeping words people say in English as they are (pickup, order, UPI, driver)." : "Write simple, friendly English that someone with basic English understands; if they wrote in Hindi or Hinglish, reply in the same simple Hinglish."} At most 5 short sentences, no headings, no markdown. Refer to people exactly as labelled ("${label} 1", "${label} 2"). Set uses_numbers to true only if your answer relies on the account numbers below.
Facts about Toss: ${ABOUT_TOSS}

Numbers:
${factSheet(snap.facts)}`,
      prompt: alias.hide(question),
      schema: { type: "object", properties: { answer: { type: "string" }, uses_numbers: { type: "boolean" } }, required: ["answer", "uses_numbers"] },
      temperature: 0.3,
      timeoutMs: 20_000,
    });
    const answer = alias.show(data.answer.trim());
    return data.uses_numbers ? { text: answer, rows: snap.rows } : { text: answer };
  } catch {
    return { text: "I couldn't think that through just now. Here are the numbers that matter; ask again in a moment:", rows: snap.rows };
  }
}

/**
 * Real names → "Driver 1, 2 …" before a question goes to the AI, and back to first names in its answer, so the
 * AI never sees who anyone is but "how far did Arpan drive" still works.
 */
export function aliases(names: string[], label: string): { hide: (s: string) => string; show: (s: string) => string } {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = names.flatMap((n, i) => [n, ...n.split(/\s+/).filter((p) => p.length > 2)].map((p) => [p, i] as const));
  parts.sort((x, y) => y[0].length - x[0].length);
  return {
    hide: (s) => parts.reduce((acc, [p, i]) => acc.replace(new RegExp(`\\b${esc(p)}\\b`, "gi"), `${label} ${i + 1}`), s),
    show: (s) => s.replace(new RegExp(`\\b${label} (\\d+)\\b`, "g"), (m, k) => names[Number(k) - 1]?.split(/\s+/)[0] ?? m),
  };
}
