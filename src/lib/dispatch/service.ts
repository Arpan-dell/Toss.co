import "server-only";
import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { orderLabel } from "../format";
import { supabaseAdmin } from "../supabase/admin";
import * as api from "../telegram-api";
import { formatPhone, fromTelegramPhone } from "../phone";
import { esc, type InlineButton } from "../telegram-api";

// Telegram messages are best-effort: a failed send (network blip, a driver who blocked the bot)
// must never stop an assignment, a hand-over or a pickup from being recorded.
const safe = <A extends unknown[]>(fn: (...args: A) => Promise<unknown>) => (...args: A) =>
  fn(...args).catch((err) => {
    logError("telegram send failed", err);
    return undefined;
  });
const sendMessage = safe(api.sendMessage);
const sendLocation = safe(api.sendLocation);
const editMessage = safe(api.editMessage);
const answerCallback = safe(api.answerCallback);
const sendPhoto = safe(api.sendPhoto);
const deleteMessage = safe(api.deleteMessage);
const editButtons = safe(api.editButtons);
type Sent = { message_id: number } | undefined;

// ---------- the messages a driver was sent about a job (migration 0030) ----------

async function remember(orderId: string, kind: "pickup" | "delivery", chatId: string, ...sent: unknown[]) {
  const rows = (sent as Sent[]).filter((m): m is { message_id: number } => !!m?.message_id).map((m) => ({ order_id: orderId, kind, chat_id: chatId, message_id: m.message_id }));
  if (rows.length) await db().from("driver_messages").insert(rows);
}

/**
 * A job left this driver (moved to someone else, taken off them, cancelled, or closed by the laundry): delete what
 * the bot sent them about it, so they don't act on it, and leave a one-line note instead. Bot states pointing at
 * the job are cleared too. Best-effort: Telegram only lets a bot delete its messages for 48 hours.
 */
export async function withdrawJob(orderId: string, kind: "pickup" | "delivery", chatId: string, note?: string) {
  const token = driverToken();
  const { data: msgs } = await db().from("driver_messages").select("id, message_id").eq("order_id", orderId).eq("kind", kind).eq("chat_id", chatId);
  if (token) for (const m of msgs ?? []) await deleteMessage(token, chatId, Number(m.message_id));
  if (msgs?.length) await db().from("driver_messages").delete().in("id", msgs.map((m) => m.id as number));
  await db().from("drivers").update({ weighing_order_id: null, weighing_step: null }).eq("telegram_chat_id", chatId).eq("weighing_order_id", orderId);
  await db().from("drivers").update({ delivering_order_id: null }).eq("telegram_chat_id", chatId).eq("delivering_order_id", orderId);
  if (token && note) await sendMessage(token, chatId, note);
}
import { chooseDriver, directionsUrl, searchUrl, type DriverCandidate, type LatLng } from "./core";
import { geocode } from "./geocode";
import { MAX_KG, MIN_KG, parseKg, repriceForWeight } from "./weighing";
import { earnings, monthStartIST, weekStartIST } from "../driver-pay";
import { bagTag, bagsLine, isSorted, sortedTotal } from "../sorting";
import { codeMatches, deliveryCode, looksLikeCode, tripRouteUrl } from "./delivery";
import { logError } from "@/lib/log";
import { tierOfRow } from "@/lib/plan";
import { APP_URL, SITE_URL } from "@/lib/site";

// Automatic pickup dispatch over the driver bot. Runs server-side with the service role:
// it crosses customers, baskets and drivers inside one business, and is triggered by trusted events
// (a new order from ingest, a manager action, or a verified Telegram webhook).

const SITE = SITE_URL;
const driverToken = () => process.env.TELEGRAM_DRIVER_BOT_TOKEN;
const customerToken = () => process.env.TELEGRAM_CUSTOMER_BOT_TOKEN;
export const dispatchEnabled = () => !!driverToken();

type Row = Record<string, unknown>;
const db = (): SupabaseClient => supabaseAdmin();
const ACTIVE = ["PENDING", "ACCEPTED"];
// a delivery the driver is holding: collecting it from the store, or on the way to the customer
const DELIVERING = ["ASSIGNED", "OUT"];

// ---------- geocoding (cached on the row) ----------

async function basketPoint(deviceId: string): Promise<LatLng | undefined> {
  const { data: d } = await db().from("devices").select("address, lat, lng, geocoded_address").eq("device_id", deviceId).maybeSingle();
  if (!d?.address) return undefined;
  if (d.geocoded_address === d.address && d.lat != null) return { lat: d.lat as number, lng: d.lng as number };
  const p = await geocode(d.address as string);
  await db().from("devices").update({ lat: p?.lat ?? null, lng: p?.lng ?? null, geocoded_address: d.address }).eq("device_id", deviceId);
  return p ?? undefined;
}

export async function geocodeStore(tenantId: string): Promise<LatLng | null> {
  const { data: t } = await db().from("tenants").select("store_address").eq("id", tenantId).maybeSingle();
  const p = t?.store_address ? await geocode(t.store_address as string) : null;
  await db().from("tenants").update({ store_lat: p?.lat ?? null, store_lng: p?.lng ?? null }).eq("id", tenantId);
  return p;
}

// Pro extras in the bots (photo proof, whites/coloured bags, handover codes, cash at the door). Customers are served
// the same on Free: pickups, dispatch, ready notices and the delivery back all keep working.
async function isPro(tenantId: string): Promise<boolean> {
  const { data } = await db().from("tenants").select("plan_status, trial_ends_at, paid_until").eq("id", tenantId).maybeSingle();
  return tierOfRow(data) === "PRO";
}

async function storeOf(tenantId: string): Promise<{ name: string; place?: LatLng | string }> {
  const { data: t } = await db().from("tenants").select("name, store_address, store_lat, store_lng").eq("id", tenantId).maybeSingle();
  const place = t?.store_lat != null ? { lat: t.store_lat as number, lng: t.store_lng as number } : (t?.store_address as string | undefined) || undefined;
  return { name: (t?.name as string) ?? "the store", place };
}

// ---------- drivers ----------

async function candidates(tenantId: string): Promise<DriverCandidate[]> {
  const [{ data: drivers }, { data: jobs }] = await Promise.all([
    db()
      .from("drivers")
      .select("id, name, telegram_chat_id, status, last_lat, last_lng, location_at, max_jobs")
      .eq("tenant_id", tenantId)
      .not("telegram_chat_id", "is", null), // not connected to the bot yet: can't be told about pickups
    db().from("orders").select("driver_id").eq("tenant_id", tenantId).in("status", ACTIVE).not("driver_id", "is", null),
  ]);
  const { data: trips } = await db().from("orders").select("delivery_driver_id").eq("tenant_id", tenantId).in("delivery_status", DELIVERING);
  const load = new Map<string, number>();
  for (const j of jobs ?? []) load.set(j.driver_id as string, (load.get(j.driver_id as string) ?? 0) + 1);
  for (const j of trips ?? []) if (j.delivery_driver_id) load.set(j.delivery_driver_id as string, (load.get(j.delivery_driver_id as string) ?? 0) + 1);
  return (drivers ?? []).map((d: Row) => ({
    id: d.id as string,
    chatId: d.telegram_chat_id as string,
    name: d.name as string,
    status: d.status as DriverCandidate["status"],
    location: d.last_lat != null ? { lat: d.last_lat as number, lng: d.last_lng as number } : undefined,
    locationAt: (d.location_at as string) ?? undefined,
    activeJobs: load.get(d.telegram_chat_id as string) ?? 0,
    maxJobs: (d.max_jobs as number) ?? 3,
  }));
}

async function driverByChat(chatId: string) {
  const { data } = await db()
    .from("drivers")
    .select("id, tenant_id, name, telegram_chat_id, status, last_lat, last_lng, location_at, route_token, weighing_order_id, weighing_step, photo_order_id, delivering_order_id, pay_type, monthly_salary")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();
  return data as Row | null;
}

/**
 * The driver's current trip as a Google Maps link: open pickups, then the store, then deliveries. Null when they
 * have nothing open.
 */
export async function currentRoute(driver: Row): Promise<{ url: string | null; stops: number }> {
  const chatId = driver.telegram_chat_id as string;
  const [{ data: jobs }, { data: drops }] = await Promise.all([
    db().from("orders").select("device_id, address").eq("driver_id", chatId).in("status", ACTIVE),
    db().from("orders").select("device_id, address, delivery_status").eq("delivery_driver_id", chatId).in("delivery_status", DELIVERING),
  ]);
  const stop = async (j: Row) => ({ point: await basketPoint(j.device_id as string), address: j.address as string });
  const pickups = await Promise.all((jobs ?? []).map(stop));
  const deliveries = await Promise.all((drops ?? []).map(stop));
  if (!pickups.length && !deliveries.length) return { url: null, stops: 0 };
  const store = await storeOf(driver.tenant_id as string);
  const here = driver.last_lat != null ? { lat: driver.last_lat as number, lng: driver.last_lng as number } : undefined;
  const collectFirst = (drops ?? []).some((d) => d.delivery_status === "ASSIGNED");
  return { url: tripRouteUrl({ driver: here, pickups, deliveries, collectFirst, store: store.place }), stops: pickups.length + deliveries.length };
}

export async function routeByToken(token: string) {
  const { data } = await db().from("drivers").select("tenant_id, name, telegram_chat_id, last_lat, last_lng").eq("route_token", token).maybeSingle();
  return data ? { driver: data as Row, ...(await currentRoute(data as Row)) } : null;
}

const routeLink = (d: Row) => `${APP_URL}/r/${d.route_token as string}`;

// ---------- assignment ----------

export type DispatchResult = { assigned: false; reason: string } | { assigned: true; driver: string; distanceKm?: number };

/**
 * Gives an unassigned open order to the best driver and tells them on Telegram. Safe to call
 * repeatedly: the conditional update only succeeds while the order still has no driver.
 */
export async function dispatchOrder(orderId: string): Promise<DispatchResult> {
  const { data: o } = await db().from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!o) return { assigned: false, reason: "order not found" };
  if (!ACTIVE.includes(o.status as string) || o.driver_id) return { assigned: false, reason: "already handled" };
  if (!o.tenant_id) return { assigned: false, reason: "basket owner hasn't joined a business" };

  const pickup = await basketPoint(o.device_id as string);
  const choice = chooseDriver(pickup, await candidates(o.tenant_id as string), { exclude: (o.declined_by as string[]) ?? [] });
  if (!choice) return { assigned: false, reason: "no driver available" };

  const now = new Date().toISOString();
  const { data: won } = await db()
    .from("orders")
    .update({ driver_id: choice.driver.chatId, status: "ACCEPTED", accepted_at: o.accepted_at ?? now, assigned_at: now, driver_ack_at: null })
    .eq("id", orderId)
    .is("driver_id", null)
    .select("id");
  if (!won?.length) return { assigned: false, reason: "assigned concurrently" };
  await db().from("drivers").update({ status: "ON_JOB" }).eq("id", choice.driver.id);

  await notifyAssignment(o as Row, choice.driver.chatId, pickup).catch((e) => logError("driver notify failed", e));
  await notifyCustomer(o as Row, `🚚 <b>${esc(choice.driver.name)}</b> is on the way to pick up your laundry (order #${o.device_order_id}).`).catch(
    (e) => logError("customer notify failed", e),
  );
  return { assigned: true, driver: choice.driver.name, distanceKm: choice.distanceKm };
}

/** Tries to place every waiting pickup of a business (e.g. when a driver comes online). */
export async function dispatchWaiting(tenantId: string): Promise<number> {
  const { data: waiting } = await db()
    .from("orders")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("status", "PENDING")
    .is("driver_id", null)
    .order("placed_at");
  let placed = 0;
  for (const w of waiting ?? []) {
    const r = await dispatchOrder(w.id as string);
    if (r.assigned) placed++;
    else if (r.reason === "no driver available") return placed;
  }
  // deliveries waiting at the store; a "customer not home" one waits for the laundry to send it again
  const { data: ready } = await db()
    .from("orders")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("delivery_status", "WAITING")
    .eq("delivery_attempts", 0)
    .is("delivery_driver_id", null)
    .order("ready_at");
  for (const w of ready ?? []) {
    const r = await dispatchDelivery(w.id as string);
    if (r.assigned) placed++;
    else if (r.reason === "no driver available") break;
  }
  return placed;
}

// ---------- deliveries (migration 0027) ----------

const unpaidAmount = (o: Row) => (o.payment_status === "UNPAID" && !o.account_id ? Math.round(Number(o.amount_due) || 0) : 0);
const bagNames = (o: Row) =>
  isSorted({ whitesKg: o.whites_kg as number | null, colouredKg: o.coloured_kg as number | null })
    ? [Number(o.whites_kg) > 0 && bagTag(o.device_order_id as number, "WHITES"), Number(o.coloured_kg) > 0 && bagTag(o.device_order_id as number, "COLOURED")]
        .filter(Boolean)
        .join(" + ")
    : `#${o.device_order_id}`;

/**
 * The laundry marked an order ready. If it delivers, the order waits at the store for a driver (dispatched now) and
 * the customer gets a 4-digit handover code; otherwise the customer is told to collect it. Safe to call twice.
 */
export async function orderReady(orderId: string, opts: { deliver?: boolean } = {}): Promise<void> {
  const { data: o } = await db().from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!o || o.status !== "COMPLETED" || o.delivery_status) return;
  const { data: t } = await db().from("tenants").select("name, delivers, store_address").eq("id", o.tenant_id as string).maybeSingle();
  const pro = await isPro(o.tenant_id as string);
  // handover codes are Pro; on Free the delivery is simply marked delivered at the door
  const code = pro ? ((o.delivery_code as string | null) ?? deliveryCode(randomInt(10_000))) : null;
  const business = esc((t?.name as string) ?? "Your laundry");
  const codeLine = (lead: string) => (code ? `\n${lead}<b>${code}</b>` : "");
  if (t?.delivers === false && !opts.deliver) {
    await db().from("orders").update({ delivery_code: code }).eq("id", orderId).is("delivery_status", null);
    await notifyCustomer(
      o as Row,
      `👕 <b>Your clothes are ready!</b>\n${business} has finished order #${o.device_order_id}.\n\n🏪 Collect them at ${esc((t?.store_address as string) || "the store")}` +
        codeLine("🔢 Your code: "),
    ).catch((e) => logError("ready notice failed", e));
    return;
  }
  const { data: started } = await db()
    .from("orders")
    .update({ delivery_status: "WAITING", delivery_code: code })
    .eq("id", orderId)
    .is("delivery_status", null)
    .select("id");
  if (!started?.length) return;
  await notifyCustomer(
    o as Row,
    `👕 <b>Your clothes are ready!</b>\n${business} has finished order #${o.device_order_id} and will bring it back to you.` +
      (code ? `\n\n🔢 Your handover code: <b>${code}</b>\n<i>Tell it to the driver when they arrive, so we know it reached you.</i>` : ""),
  ).catch((e) => logError("ready notice failed", e));
  await dispatchDelivery(orderId).catch((e) => logError("delivery dispatch failed", e));
}

/** Gives a waiting delivery to the best driver (nearest to the store, where the clothes are). Safe to repeat. */
export async function dispatchDelivery(orderId: string): Promise<DispatchResult> {
  const { data: o } = await db().from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!o) return { assigned: false, reason: "order not found" };
  if (o.delivery_status !== "WAITING" || o.delivery_driver_id) return { assigned: false, reason: "already handled" };
  const store = await storeOf(o.tenant_id as string);
  const from = store.place && typeof store.place !== "string" ? store.place : await basketPoint(o.device_id as string);
  const choice = chooseDriver(from, await candidates(o.tenant_id as string), { exclude: (o.delivery_declined_by as string[]) ?? [] });
  if (!choice) return { assigned: false, reason: "no driver available" };
  const { data: won } = await db()
    .from("orders")
    .update({ delivery_driver_id: choice.driver.chatId, delivery_status: "ASSIGNED", delivery_assigned_at: new Date().toISOString(), delivery_ack_at: null })
    .eq("id", orderId)
    .eq("delivery_status", "WAITING")
    .is("delivery_driver_id", null)
    .select("id");
  if (!won?.length) return { assigned: false, reason: "assigned concurrently" };
  await db().from("drivers").update({ status: "ON_JOB" }).eq("id", choice.driver.id);
  await notifyDelivery(o as Row, choice.driver.chatId).catch((e) => logError("driver notify failed", e));
  return { assigned: true, driver: choice.driver.name, distanceKm: choice.distanceKm };
}

/** Tells a driver about a delivery they've been given (also used when the manager assigns one). */
export async function notifyDelivery(order: Row, chatId: string) {
  const token = driverToken();
  if (!token) return;
  const driver = await driverByChat(chatId);
  const store = await storeOf(order.tenant_id as string);
  const { data: c } = order.customer_id
    ? await db().from("customers").select("name, phone").eq("id", order.customer_id as string).maybeSingle()
    : { data: null };
  const id = order.id as string;
  const due = unpaidAmount(order);
  const lines = [
    `📦 <b>NEW DELIVERY</b> · ${esc(orderLabel({ deviceId: order.device_id as string, deviceOrderId: order.device_order_id as number }))}`,
    LINE,
    `🏪 Collect from <b>${esc(store.name)}</b>: bag${isSorted({ whitesKg: order.whites_kg as number | null, colouredKg: order.coloured_kg as number | null }) ? "s" : ""} <code>${bagNames(order)}</code>`,
    `📍 Deliver to ${esc((order.address as string) || "Address not set")}`,
    c?.name ? `👤 ${esc(c.name as string)}` : null,
    c?.phone ? `📞 ${formatPhone(c.phone as string)}` : null,
    due ? `💵 To collect: <b>₹${due}</b> (or the customer pays online)` : order.account_id ? "🧾 On a monthly account: nothing to collect" : "✅ Already paid",
  ].filter(Boolean);
  const card = await sendMessage(token, chatId, lines.join("\n"), { inline: deliveryAssignButtons(order, driver, store.place, !order.delivery_ack_at) });
  await remember(id, "delivery", chatId, card);
}

function deliveryAssignButtons(order: Row, driver: Row | null, storePlace: LatLng | string | undefined, withAck: boolean): InlineButton[][] {
  const id = order.id as string;
  return [
    ...(withAck ? [[{ text: "👍 Got it", callback_data: `dack:${id}` }]] : []),
    ...(storePlace ? [[{ text: "🗺 Navigate to the store", url: directionsUrl({ destination: storePlace }) }]] : []),
    ...(driver ? [[{ text: "🛣 My full route (always up to date)", url: routeLink(driver) }]] : []),
    [
      { text: "📦 Collected from store", callback_data: `dgot:${id}` },
      { text: "↩️ Can't take it", callback_data: `ddecline:${id}` },
    ],
  ];
}

const deliveryButtons = (o: Row, navigate: string): InlineButton[][] => [
  [{ text: "🗺 Navigate to customer", url: navigate }],
  [
    { text: "✅ Delivered", callback_data: `ddone:${o.id}` },
    { text: "🚪 Not home", callback_data: `dnothome:${o.id}` },
  ],
];

// The handover: the customer's code matched (verified) or the driver delivered without it.
async function completeDelivery(token: string, driver: Row, o: Row, verified: boolean | null) {
  const chatId = driver.telegram_chat_id as string;
  const { data: done } = await db()
    .from("orders")
    .update({ delivery_status: "DELIVERED", delivered_at: new Date().toISOString(), delivery_verified: verified })
    .eq("id", o.id as string)
    .eq("delivery_driver_id", chatId)
    .eq("delivery_status", "OUT")
    .select("id");
  await db().from("drivers").update({ delivering_order_id: null }).eq("id", driver.id as string);
  if (!done?.length) {
    await sendMessage(token, chatId, "This delivery was already closed.", { keyboard: MENU });
    return;
  }
  const due = unpaidAmount(o);
  await sendMessage(token, chatId, `✅ <b>Delivered</b> · #${o.device_order_id}${verified ? " · code checked ✓" : ""}`, { keyboard: MENU });
  // recording cash at the door is Pro
  if (due && (await isPro(o.tenant_id as string))) {
    await sendMessage(token, chatId, `💵 <b>₹${due}</b> is still unpaid. Did the customer pay you cash?`, {
      inline: [[{ text: `Collected ₹${due} cash`, callback_data: `dcash:${o.id}` }], [{ text: "No, they'll pay online", callback_data: `dnocash:${o.id}` }]],
    });
  }
  const { data: t } = await db().from("tenants").select("name").eq("id", o.tenant_id as string).maybeSingle();
  await notifyCustomer(
    o,
    `📦 <b>Delivered!</b> Your clothes from ${esc((t?.name as string) ?? "your laundry")} are back (order #${o.device_order_id}).` +
      (due ? `\n💵 ₹${due} is due: pay in the Toss app (${APP_URL}/app) or to the driver.` : "") +
      "\nThank you!",
  ).catch(() => {});
  await nextStop(token, driver);
}

// After a delivery: the rest of the trip, or done for now.
async function nextStop(token: string, driver: Row) {
  const chatId = driver.telegram_chat_id as string;
  const r = await currentRoute(driver);
  if (r.url) {
    await sendMessage(token, chatId, `👍 <b>${r.stops} more stop${r.stops > 1 ? "s" : ""}</b> to go.`, {
      inline: [[{ text: "🛣 Continue route", url: routeLink(driver) }]],
    });
    return;
  }
  await db().from("drivers").update({ status: "AVAILABLE" }).eq("id", driver.id as string).neq("status", "OFFLINE");
  await sendMessage(token, chatId, "🏁 <b>All done!</b> New pickups and deliveries will come here.", { keyboard: MENU });
}

// Buttons on delivery messages. Only the driver holding the delivery can use them.
async function handleDeliveryButton(token: string, cb: NonNullable<TgUpdate["callback_query"]>, action: string, orderId: string) {
  const chatId = String(cb.from.id);
  const driver = await driverByChat(chatId);
  const { data: o } = await db().from("orders").select("*").eq("id", orderId).maybeSingle();
  const after = action === "dcash" || action === "dnocash";
  if (!driver || !o || o.delivery_driver_id !== chatId || (after ? o.delivery_status !== "DELIVERED" : !DELIVERING.includes(o.delivery_status as string))) {
    await answerCallback(token, cb.id, "This delivery isn't yours anymore.");
    return;
  }
  const msg = cb.message;
  const edit = (text: string) => (msg ? editMessage(token, String(msg.chat.id), msg.message_id, text) : Promise.resolve(undefined));

  if (action === "dack") {
    await db().from("orders").update({ delivery_ack_at: new Date().toISOString() }).eq("id", orderId).eq("delivery_driver_id", chatId).is("delivery_ack_at", null);
    await answerCallback(token, cb.id, "👍 Thanks! The laundry can see you've got it.");
    if (msg) {
      const store = await storeOf(o.tenant_id as string);
      await editButtons(token, String(msg.chat.id), msg.message_id, deliveryAssignButtons(o as Row, driver, store.place, false));
    }
    return;
  }
  if (action === "dgot") {
    if (o.delivery_status !== "ASSIGNED") return void (await answerCallback(token, cb.id, "Already on the way"));
    await db()
      .from("orders")
      .update({ delivery_status: "OUT", out_for_delivery_at: new Date().toISOString(), delivery_ack_at: o.delivery_ack_at ?? new Date().toISOString() })
      .eq("id", orderId)
      .eq("delivery_status", "ASSIGNED");
    await answerCallback(token, cb.id, "On the way 🚚");
    await edit(`📦 <b>Collected</b> · #${o.device_order_id}`);
    const point = await basketPoint(o.device_id as string);
    const card = await sendMessage(
      token,
      chatId,
      `🚚 <b>Deliver</b> · #${o.device_order_id}\n${LINE}\n📍 ${esc((o.address as string) || "Address not set")}` +
        (o.delivery_code ? "\n\nAt the door, ask the customer for their <b>4-digit code</b>." : ""),
      { inline: deliveryButtons(o as Row, point ? directionsUrl({ destination: point }) : searchUrl(o.address as string)) },
    );
    await remember(orderId, "delivery", chatId, card);
    await notifyCustomer(
      o as Row,
      `🚚 <b>${esc(driver.name as string)}</b> is bringing your clothes back (order #${o.device_order_id}).` +
        (o.delivery_code ? `\n🔢 Your code: <b>${o.delivery_code}</b>` : ""),
    ).catch(() => {});
  } else if (action === "ddecline") {
    if (o.delivery_status !== "ASSIGNED") return void (await answerCallback(token, cb.id, "You've collected it: use Not home if you can't deliver"));
    await db()
      .from("orders")
      .update({ delivery_driver_id: null, delivery_status: "WAITING", delivery_assigned_at: null, delivery_declined_by: [...((o.delivery_declined_by as string[]) ?? []), chatId] })
      .eq("id", orderId)
      .eq("delivery_status", "ASSIGNED");
    await answerCallback(token, cb.id, "Passed on. We'll find another driver.");
    await edit(`↩️ <i>You passed on delivery #${o.device_order_id}.</i>`);
    await dispatchDelivery(orderId);
  } else if (action === "ddone" && !o.delivery_code) {
    await answerCallback(token, cb.id, "Delivered ✅");
    await edit(`✅ <i>Delivered · #${o.device_order_id}</i>`);
    await completeDelivery(token, driver, o as Row, null);
  } else if (action === "ddone") {
    await db().from("drivers").update({ delivering_order_id: orderId }).eq("id", driver.id as string);
    await answerCallback(token, cb.id, "Ask for the code 🔢");
    await sendMessage(token, chatId, `🔢 <b>Handover code</b> · #${o.device_order_id}\nAsk the customer for their 4-digit code and send it here.`, {
      inline: [[{ text: "Customer doesn't have the code", callback_data: `dnocode:${orderId}` }]],
    });
  } else if (action === "dnocode") {
    await answerCallback(token, cb.id, "Delivered without the code");
    await edit(`🔢 <i>Delivered without the code.</i>`);
    await completeDelivery(token, driver, o as Row, false);
  } else if (action === "dnothome") {
    await db()
      .from("orders")
      .update({ delivery_driver_id: null, delivery_status: "WAITING", delivery_assigned_at: null, out_for_delivery_at: null, delivery_attempts: (Number(o.delivery_attempts) || 0) + 1 })
      .eq("id", orderId)
      .eq("delivery_status", "OUT");
    await db().from("drivers").update({ delivering_order_id: null }).eq("id", driver.id as string).eq("delivering_order_id", orderId);
    await answerCallback(token, cb.id, "Take it back to the store");
    await edit(`🚪 <i>Not home · #${o.device_order_id}. Take the bags back to the store.</i>`);
    const { data: t } = await db().from("tenants").select("name").eq("id", o.tenant_id as string).maybeSingle();
    await notifyCustomer(
      o as Row,
      `🚪 We came to deliver order #${o.device_order_id} but couldn't reach you. ${esc((t?.name as string) ?? "Your laundry")} will try again soon.`,
    ).catch(() => {});
    await nextStop(token, driver);
  } else if (action === "dcash") {
    const { data: paid } = await db()
      .from("orders")
      .update({ payment_status: "PENDING", payment_method: "CASH", payment_ref: null, payment_reported_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("payment_status", "UNPAID")
      .select("id");
    await answerCallback(token, cb.id, paid?.length ? "Noted. Hand the cash to the store." : "Already paid");
    await edit(paid?.length ? `💵 <b>Cash ₹${unpaidAmount(o as Row)} collected</b> · #${o.device_order_id}\n<i>Hand it to the store; they'll confirm it.</i>` : "💵 Already paid.");
  } else if (action === "dnocash") {
    await answerCallback(token, cb.id, "OK");
    await edit("💵 <i>The customer will pay online.</i>");
  }
}

/** Tells a driver about a pickup they've been given (also used for manual assignment from the dashboard). */
export async function notifyAssignment(order: Row, chatId: string, pickup?: LatLng) {
  const token = driverToken();
  if (!token) return;
  const driver = await driverByChat(chatId);
  const store = await storeOf(order.tenant_id as string);
  const { data: c } = order.customer_id
    ? await db().from("customers").select("name, phone").eq("id", order.customer_id as string).maybeSingle()
    : { data: null };

  const pin = pickup ? await sendLocation(token, chatId, pickup.lat, pickup.lng) : undefined;
  const buttons = assignmentButtons(order, driver, pickup, !order.driver_ack_at);
  const lines = [
    `🔔 <b>NEW PICKUP</b> · ${esc(orderLabel({ deviceId: order.device_id as string, deviceOrderId: order.device_order_id as number }))}`,
    "━━━━━━━━━━━━━━",
    `📍 ${esc((order.address as string) || "Address not set")}`,
    c?.name ? `👤 ${esc(c.name as string)}` : null,
    // Customer numbers are private: only the driver collecting the laundry gets one, and it disappears
    // from this message once they mark it picked up.
    c?.phone ? `📞 ${formatPhone(c.phone as string)}` : null,
    `⚖️ ${Number(order.weight_kg).toFixed(1)} kg`,
    store.place ? `🏁 Then deliver to <b>${esc(store.name)}</b>` : null,
  ].filter(Boolean);
  const card = await sendMessage(token, chatId, lines.join("\n"), { inline: buttons });
  await remember(order.id as string, "pickup", chatId, pin, card);
}

// "Got it" first (until the driver confirms), then navigation and the job's buttons.
function assignmentButtons(order: Row, driver: Row | null, pickup: LatLng | undefined, withAck: boolean): InlineButton[][] {
  const id = order.id as string;
  return [
    ...(withAck ? [[{ text: "👍 Got it", callback_data: `ack:${id}` }]] : []),
    [{ text: "🗺 Navigate to pickup", url: pickup ? directionsUrl({ destination: pickup }) : searchUrl(order.address as string) }],
    ...(driver ? [[{ text: "🛣 My full route (always up to date)", url: routeLink(driver) }]] : []),
    [
      { text: "✅ Picked up", callback_data: `done:${id}` },
      { text: "↩️ Can't take it", callback_data: `decline:${id}` },
    ],
  ];
}

async function notifyCustomer(order: Row, text: string) {
  const token = customerToken();
  const chat = order.customer_telegram_id as string | null;
  if (token && chat) await sendMessage(token, chat, text);
}

// ---------- driver bot ("Toss Handy") ----------

const BANNER = `${SITE}/brand/driver/welcome.jpg`;
const LINE = "━━━━━━━━━━━━━━";

const MENU = {
  keyboard: [
    [{ text: "🟢 Online" }, { text: "🔴 Offline" }],
    [{ text: "📋 My jobs" }, { text: "🛣 My route" }],
    [{ text: "👤 My status" }, { text: "💰 My earnings" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "Toss Handy",
};

const SHARE_PHONE = {
  keyboard: [[{ text: "📱 Share my phone number", request_contact: true }]],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "Tap the button below",
};

const HOW_IT_WORKS = [
  "<b>How it works</b>",
  "🟢 <b>Online</b>: tap it when you start working",
  "📍 <b>Live location</b>: 📎 → Location → <i>Share live location</i>, so you get the nearest pickups",
  "🧺 <b>Pickups</b> arrive here with a 🗺 Google Maps button",
  "📦 <b>Deliveries</b>: collect clean clothes from the store and take them back; ask the customer for their 4-digit code",
  "🛣 <b>My route</b>: every stop in order: pickups, the store, then deliveries",
].join("\n");

const WELCOME = (name: string) => `👋 <b>Hi ${esc(name)}, welcome to Toss Handy</b>\n${LINE}\n${HOW_IT_WORKS}`;

// A card with the branded banner on top; falls back to plain text if the photo can't be sent.
async function sendBanner(token: string, chatId: string, caption: string, keyboard: api.ReplyKeyboard) {
  const sent = await sendPhoto(token, chatId, BANNER, caption, { keyboard });
  if (!sent) await sendMessage(token, chatId, caption, { keyboard });
}

// Midnight in India, as an ISO timestamp: "today" for the driver's daily count.
function startOfTodayIST(now = Date.now()) {
  const IST = 5.5 * 3_600_000;
  return new Date(Math.floor((now + IST) / 86_400_000) * 86_400_000 - IST).toISOString();
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

async function statusCard(driver: Row): Promise<string> {
  const chatId = driver.telegram_chat_id as string;
  const [{ count: open }, { count: done }, { count: openDrops }, { count: dropped }, store] = await Promise.all([
    db().from("orders").select("id", { count: "exact", head: true }).eq("driver_id", chatId).in("status", ACTIVE),
    db().from("orders").select("id", { count: "exact", head: true }).eq("driver_id", chatId).eq("status", "COMPLETED").gte("completed_at", startOfTodayIST()),
    db().from("orders").select("id", { count: "exact", head: true }).eq("delivery_driver_id", chatId).in("delivery_status", DELIVERING),
    db().from("orders").select("id", { count: "exact", head: true }).eq("delivery_driver_id", chatId).eq("delivery_status", "DELIVERED").gte("delivered_at", startOfTodayIST()),
    storeOf(driver.tenant_id as string),
  ]);
  const status = driver.status === "OFFLINE" ? "🔴 Offline" : driver.status === "ON_JOB" ? "🚚 On a job" : "🟢 Online";
  const fresh = driver.location_at && Date.now() - new Date(driver.location_at as string).getTime() < 30 * 60_000;
  const location = driver.location_at ? `${fresh ? "📍" : "⚠️"} Location: ${ago(driver.location_at as string)}` : "⚠️ Location: not shared yet";
  return [
    `👤 <b>${esc(driver.name as string)}</b> · ${esc(store.name)}`,
    LINE,
    `Status: <b>${status}</b>`,
    location,
    `🧺 Open pickups: <b>${open ?? 0}</b> · 📦 deliveries: <b>${openDrops ?? 0}</b>`,
    `✅ Done today: <b>${done ?? 0}</b> pickups · <b>${dropped ?? 0}</b> deliveries`,
    ...(!fresh && driver.status !== "OFFLINE" ? ["", "<i>Share your live location so you get the nearest pickups.</i>"] : []),
  ].join("\n");
}

// What the driver has earned at their laundry's rates: this week, last week and this month (IST).
async function earningsCard(driver: Row): Promise<string> {
  const chatId = driver.telegram_chat_id as string;
  const now = new Date();
  const week = weekStartIST(now);
  const lastWeek = weekStartIST(now, 1);
  const month = monthStartIST(now);
  const from = lastWeek < month ? lastWeek : month;
  const [{ data: t }, { data: done }] = await Promise.all([
    db().from("tenants").select("store_lat, store_lng, driver_pay_per_pickup, driver_pay_per_km").eq("id", driver.tenant_id as string).maybeSingle(),
    db().from("orders").select("device_id, completed_at").eq("driver_id", chatId).eq("status", "COMPLETED").gte("completed_at", from),
  ]);
  // deliveries are trips too, paid like pickups
  const { data: drops } = await db().from("orders").select("device_id, delivered_at").eq("delivery_driver_id", chatId).eq("delivery_status", "DELIVERED").gte("delivered_at", from);
  const trips = [
    ...(done ?? []).map((o) => ({ deviceId: o.device_id as string, at: o.completed_at as string })),
    ...(drops ?? []).map((o) => ({ deviceId: o.device_id as string, at: o.delivered_at as string })),
  ];
  const count = (start: string, end?: string) => trips.filter((o) => o.at >= start && (!end || o.at < end)).length;
  if (driver.pay_type === "SALARY") {
    const n = (k: number) => `${k} trip${k === 1 ? "" : "s"}`;
    return [
      `💰 <b>Your pay</b> · ${esc(driver.name as string)}`,
      LINE,
      `Salary: <b>₹${Number(driver.monthly_salary).toLocaleString("en-IN")}</b> a month`,
      "",
      `This week: ${n(count(week))}`,
      `Last week: ${n(count(lastWeek, week))}`,
      `This month: ${n(count(month))}`,
      "",
      "<i>Trips are pickups and deliveries. Your laundry pays your salary.</i>",
    ].join("\n");
  }
  const rates = { driverPayPerPickup: Number(t?.driver_pay_per_pickup) || 0, driverPayPerKm: Number(t?.driver_pay_per_km) || 0 };
  if (!rates.driverPayPerPickup && !rates.driverPayPerKm) return "💰 Your laundry hasn't set driver pay in Toss yet. Ask your manager.";
  const ids = [...new Set(trips.map((o) => o.deviceId))];
  const { data: devs } = ids.length ? await db().from("devices").select("device_id, lat, lng").in("device_id", ids) : { data: [] };
  const at = new Map((devs ?? []).filter((d) => d.lat != null && d.lng != null).map((d) => [d.device_id as string, { lat: Number(d.lat), lng: Number(d.lng) }]));
  const store = t?.store_lat != null && t?.store_lng != null ? { lat: Number(t.store_lat), lng: Number(t.store_lng) } : null;
  const between = (start: string, end?: string) => trips.filter((o) => o.at >= start && (!end || o.at < end));
  const line = (label: string, start: string, end?: string) => {
    const e = earnings(between(start, end), rates, store, (id) => at.get(id));
    return `${label}: <b>₹${e.pay}</b> · ${e.pickups} trip${e.pickups === 1 ? "" : "s"}${e.km ? ` · ${e.km} km` : ""}`;
  };
  return [
    `💰 <b>Your earnings</b> · ${esc(driver.name as string)}`,
    LINE,
    line("This week", week),
    line("Last week", lastWeek, week),
    line("This month", month),
    "",
    `<i>₹${rates.driverPayPerPickup} per pickup or delivery${rates.driverPayPerKm ? ` + ₹${rates.driverPayPerKm}/km from the store` : ""}. Paid by your laundry.</i>`,
  ].join("\n");
}

// phone: the customer's number, shown only on open pickups (never to managers).
const pickupCard = (j: Row, title: string, phone?: string | null) =>
  [
    `🧺 <b>${title}</b> · #${j.device_order_id}`,
    LINE,
    `📍 ${esc((j.address as string) || "Address not set")}`,
    `⚖️ ${Number(j.weight_kg).toFixed(1)} kg`,
    ...(phone ? [`📞 ${formatPhone(phone)}`] : []),
  ].join("\n");

const pickupButtons = (j: Row, navigate: string): InlineButton[][] => [
  [{ text: "🗺 Navigate", url: navigate }],
  [
    { text: "✅ Picked up", callback_data: `done:${j.id}` },
    { text: "↩️ Can't take it", callback_data: `decline:${j.id}` },
  ],
];

// The driver shared their contact with the request_contact button. Telegram only lets people share
// their own number that way (contact.user_id is the sender), so the number is genuine; we attach this
// chat to the driver the manager added with that number.
async function connectByPhone(token: string, chatId: string, msg: TgMessage) {
  const contact = msg.contact!;
  const phone = fromTelegramPhone(contact.phone_number);
  if (!phone || contact.user_id === undefined || contact.user_id !== msg.from?.id) {
    await sendMessage(token, chatId, "🙅 Please share <b>your own</b> number with the button below.", { keyboard: SHARE_PHONE });
    return;
  }
  const { data: won } = await db()
    .from("drivers")
    .update({ telegram_chat_id: chatId })
    .eq("phone", phone)
    .is("telegram_chat_id", null)
    .select("name")
    .maybeSingle();
  if (!won) {
    await sendMessage(
      token,
      chatId,
      `🔎 <b>Number not found</b>\n${LINE}\nNo laundry has added <b>${esc(phone)}</b> as a driver yet.\n\nAsk your manager to add you on Toss (<i>Fleet → Add driver</i>) with this number, then tap the button again.`,
      { keyboard: SHARE_PHONE },
    );
    return;
  }
  await sendBanner(token, chatId, `✅ <b>You're connected!</b>\n\n${WELCOME(won.name as string)}`, MENU);
}

interface TgUpdate {
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: { id: string; data?: string; from: { id: number }; message?: { message_id: number; chat: { id: number } } };
}
interface TgMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: { id: number };
  text?: string;
  contact?: { phone_number: string; user_id?: number };
  location?: { latitude: number; longitude: number; live_period?: number };
  photo?: { file_id: string; width: number; height: number; file_size?: number }[];
}

export async function handleDriverUpdate(update: TgUpdate): Promise<void> {
  const token = driverToken();
  if (!token) return;
  if (update.callback_query) return handleButton(token, update.callback_query);

  const msg = update.message ?? update.edited_message;
  if (!msg || msg.chat.type !== "private") return;
  const chatId = String(msg.chat.id);
  const driver = await driverByChat(chatId);

  if (!driver) {
    if (!update.message) return;
    if (msg.contact) return connectByPhone(token, chatId, msg);
    await sendBanner(
      token,
      chatId,
      `👋 <b>Welcome to Toss Handy</b>\n${LINE}\nThe driver app for Toss laundries: pickups near you, with routes that end at the store.\n\nTap <b>📱 Share my phone number</b> below. If your laundry added you with this number, you're connected right away.`,
      SHARE_PHONE,
    );
    return;
  }

  // Live location: Telegram sends the first point as a message, then updates as edited messages.
  if (msg.location) {
    await db()
      .from("drivers")
      .update({ last_lat: msg.location.latitude, last_lng: msg.location.longitude, location_at: new Date().toISOString() })
      .eq("id", driver.id as string);
    if (update.message) {
      const live = !!msg.location.live_period;
      await sendMessage(
        token,
        chatId,
        live
          ? "📍 <b>Live location on</b>\nYou'll get the pickups nearest to you."
          : "📍 <b>Got it</b>\nFor automatic nearest pickups, share your <b>live</b> location: 📎 → Location → <i>Share live location</i>.",
        { keyboard: MENU },
      );
      if (driver.status !== "OFFLINE") await dispatchWaiting(driver.tenant_id as string);
    }
    return;
  }

  // Photo proof: right after a pickup, the next photo belongs to it (the largest size Telegram sent).
  if (msg.photo?.length) {
    if (!update.message) return;
    if (!driver.photo_order_id) {
      await sendMessage(token, chatId, "📸 Photos are only needed right after a pickup.", { keyboard: MENU });
      return;
    }
    const best = msg.photo[msg.photo.length - 1];
    const { data: saved } = await db()
      .from("orders")
      .update({ pickup_photo_file_id: best.file_id, pickup_photo_at: new Date().toISOString() })
      .eq("id", driver.photo_order_id as string)
      .eq("driver_id", chatId)
      .select("device_order_id");
    await db().from("drivers").update({ photo_order_id: null }).eq("id", driver.id as string);
    await sendMessage(token, chatId, saved?.length ? `📸 <b>Photo saved</b> with pickup #${saved[0].device_order_id}. Thank you!` : "This pickup isn't yours anymore.", {
      keyboard: MENU,
    });
    return;
  }

  const text = (msg.text ?? "").trim();

  // Handover: four digits after "Delivered" are the customer's code.
  if (driver.delivering_order_id && update.message && looksLikeCode(text)) {
    const { data: o } = await db().from("orders").select("*").eq("id", driver.delivering_order_id as string).maybeSingle();
    if (!o || o.delivery_driver_id !== chatId || o.delivery_status !== "OUT") {
      await db().from("drivers").update({ delivering_order_id: null }).eq("id", driver.id as string);
      await sendMessage(token, chatId, "This delivery isn't yours anymore.", { keyboard: MENU });
      return;
    }
    if (!codeMatches(text, o.delivery_code as string)) {
      await sendMessage(token, chatId, "❌ That code doesn't match. Ask the customer to check the Toss message, then send it again.", {
        inline: [[{ text: "Customer doesn't have the code", callback_data: `dnocode:${o.id}` }]],
      });
      return;
    }
    await completeDelivery(token, driver, o as Row, true);
    return;
  }

  // Mid weigh-in: a number is the bag's weight. Anything else (menu buttons) works as usual.
  if (driver.weighing_order_id && update.message) {
    const kg = parseKg(text);
    if (kg === "range") {
      await sendMessage(token, chatId, `⚖️ That doesn't look right. Send the weight in kg between ${MIN_KG} and ${MAX_KG}, like <code>6.4</code>.`);
      return;
    }
    if (kg !== null) {
      const { data: o } = await db().from("orders").select("*").eq("id", driver.weighing_order_id as string).maybeSingle();
      if (!o || o.driver_id !== chatId || !ACTIVE.includes(o.status as string)) {
        await db().from("drivers").update({ weighing_order_id: null }).eq("id", driver.id as string);
        await sendMessage(token, chatId, "This pickup isn't yours anymore.", { keyboard: MENU });
        return;
      }
      if (driver.weighing_step === "WHITES") return weighBag(token, driver, o as Row, "WHITES", kg);
      if (driver.weighing_step === "COLOURED") return weighBag(token, driver, o as Row, "COLOURED", kg);
      await finishPickup(token, driver, o as Row, kg, "driver");
      return;
    }
  }

  if (text === "/start" || text === "/help") {
    await sendBanner(token, chatId, WELCOME(driver.name as string), MENU);
  } else if (text === "🟢 Online" || text === "/online") {
    await db().from("drivers").update({ status: "AVAILABLE" }).eq("id", driver.id as string);
    const placed = await dispatchWaiting(driver.tenant_id as string);
    await sendMessage(
      token,
      chatId,
      `🟢 <b>You're online</b>\n${LINE}\n${placed ? `🧺 ${placed} waiting pickup${placed > 1 ? "s" : ""} assigned to you.` : "New pickups will come here."}${driver.location_at ? "" : "\n\n📍 Share your <b>live location</b> so you get the nearest ones."}`,
      { keyboard: MENU },
    );
  } else if (text === "🔴 Offline" || text === "/offline") {
    await db().from("drivers").update({ status: "OFFLINE" }).eq("id", driver.id as string);
    await sendMessage(token, chatId, `🔴 <b>You're offline</b>\n${LINE}\nNo new pickups until you go online.\nFinish any open ones from 📋 <b>My pickups</b>.`, { keyboard: MENU });
  } else if (text === "👤 My status" || text === "/status") {
    await sendMessage(token, chatId, await statusCard(driver), { keyboard: MENU });
  } else if (text === "💰 My earnings" || text === "/earnings") {
    await sendMessage(token, chatId, await earningsCard(driver), { keyboard: MENU });
  } else if (text === "🛣 My route" || text === "/route") {
    const r = await currentRoute(driver);
    await sendMessage(
      token,
      chatId,
      r.url ? `🛣 <b>Your route</b>\n${LINE}\n${r.stops} pickup${r.stops > 1 ? "s" : ""}, then the store 🏁\n<i>The link stays up to date as pickups change.</i>` : "🛣 No open pickups right now.",
      r.url ? { inline: [[{ text: "🗺 Open route in Google Maps", url: routeLink(driver) }]] } : { keyboard: MENU },
    );
  } else if (text === "📋 My jobs" || text === "📋 My pickups" || text === "/pickups" || text === "/jobs") {
    const { data: jobs } = await db()
      .from("orders")
      .select("id, device_id, device_order_id, address, weight_kg, customer_id")
      .eq("driver_id", chatId)
      .in("status", ACTIVE)
      .order("assigned_at");
    const { data: drops } = await db()
      .from("orders")
      .select("*")
      .eq("delivery_driver_id", chatId)
      .in("delivery_status", DELIVERING)
      .order("delivery_assigned_at");
    if (!jobs?.length && !drops?.length) {
      await sendMessage(token, chatId, "📋 Nothing open. Stay 🟢 online and new pickups and deliveries will come here.", { keyboard: MENU });
    } else {
      await sendMessage(token, chatId, `📋 <b>Your jobs</b>: ${jobs?.length ?? 0} pickup${jobs?.length === 1 ? "" : "s"}, ${drops?.length ?? 0} deliver${drops?.length === 1 ? "y" : "ies"}`, {
        keyboard: MENU,
      });
      for (const d of drops ?? []) {
        if (d.delivery_status === "ASSIGNED") await notifyDelivery(d as Row, chatId);
        else {
          const point = await basketPoint(d.device_id as string);
          await sendMessage(token, chatId, `🚚 <b>Deliver</b> · #${d.device_order_id}\n${LINE}\n📍 ${esc((d.address as string) || "Address not set")}`, {
            inline: deliveryButtons(d as Row, point ? directionsUrl({ destination: point }) : searchUrl(d.address as string)),
          });
        }
      }
    }
    if (jobs?.length) {
      const ids = jobs.map((j) => j.customer_id as string | null).filter((v): v is string => !!v);
      const { data: people } = ids.length ? await db().from("customers").select("id, phone").in("id", ids) : { data: [] };
      const phoneOf = new Map((people ?? []).map((p: Row) => [p.id as string, p.phone as string | null]));
      for (const j of jobs) {
        const card = await sendMessage(token, chatId, pickupCard(j, "Pickup", phoneOf.get(j.customer_id as string)), { inline: pickupButtons(j, searchUrl(j.address as string)) });
        await remember(j.id as string, "pickup", chatId, card);
      }
    }
  } else {
    await sendMessage(token, chatId, "Use the buttons below 👇", { keyboard: MENU });
  }
}

// Completes a pickup with the weight that will be billed: the driver's scale reading ("driver") or the
// basket's own ("basket"). An unpaid order is re-priced at its own rate per kg (discount re-applied); the
// basket's original reading is kept for comparison. Only the driver holding the pickup gets here, and the
// update only applies while it's still open, so a double tap can't complete it twice.
async function finishPickup(
  token: string,
  driver: Row,
  o: Row,
  kg: number,
  source: "driver" | "basket",
  msg?: { chat: { id: number }; message_id: number },
  bags?: { whitesKg: number; colouredKg: number },
) {
  const chatId = driver.telegram_chat_id as string;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: "COMPLETED",
    completed_at: now,
    weight_source: source,
    reported_weight_kg: o.reported_weight_kg ?? o.weight_kg,
    // whites and coloured bags (only when both were weighed; a basket reading can't be split)
    whites_kg: bags?.whitesKg ?? null,
    coloured_kg: bags?.colouredKg ?? null,
  };
  if (source === "driver") Object.assign(patch, { weight_kg: kg, weighed_kg: kg, weighed_at: now });
  if (source === "driver" && o.payment_status === "UNPAID") {
    const { data: t } = await db().from("tenants").select("price_per_kg").eq("id", o.tenant_id as string).maybeSingle();
    const priced = repriceForWeight(
      {
        weightKg: Number(o.weight_kg) || 0,
        // price before basket credit: the database takes the credit off again after repricing
        amountDue: Number(o.amount_gross ?? o.amount_due) || 0,
        amountBeforeDiscount: o.amount_before_discount as number | null,
        discountPct: o.discount_pct as number | null,
      },
      kg,
      Number(t?.price_per_kg) || 0,
    );
    Object.assign(patch, { amount_due: priced.amountDue, amount_before_discount: priced.amountBeforeDiscount });
  }
  const { data: done } = await db().from("orders").update(patch).eq("id", o.id as string).eq("driver_id", chatId).in("status", ACTIVE).select("amount_due");
  await db().from("drivers").update({ weighing_order_id: null, weighing_step: null }).eq("id", driver.id as string);
  if (!done?.length) {
    await sendMessage(token, chatId, "This pickup was already closed.", { keyboard: MENU });
    return;
  }
  const amount = Math.round(Number(done[0].amount_due) || 0);
  const split = bags ? `\n${bagsLine(bags, true)}` : "";
  const weighed = (source === "driver" ? `⚖️ ${kg} kg weighed` : `⚖️ ${kg} kg (basket reading)`) + split;
  if (msg) await editMessage(token, String(msg.chat.id), msg.message_id, `✅ <b>Picked up</b> · #${o.device_order_id}\n<s>${esc((o.address as string) || "")}</s>`);
  await sendMessage(token, chatId, `✅ <b>Picked up</b> · #${o.device_order_id}\n${weighed} · ₹${amount}`, { keyboard: MENU });
  await notifyCustomer(
    o,
    `✅ Your laundry has been picked up (order #${o.device_order_id}).\n${source === "driver" ? `⚖️ Weighed at pickup: <b>${kg} kg</b>` : `⚖️ ${kg} kg`} · <b>₹${amount}</b>${
      bags ? `\n${bagsLine(bags, true)}\n<i>Whites and coloured clothes are washed separately.</i>` : ""
    }\nThank you!`,
  ).catch(() => {});

  const r = await currentRoute(driver);
  if (r.url) {
    await sendMessage(token, chatId, `👍 Nice! <b>${r.stops} more stop${r.stops > 1 ? "s" : ""}</b> to go.`, {
      inline: [[{ text: "🛣 Continue route", url: routeLink(driver) }]],
    });
  } else {
    const store = await storeOf(driver.tenant_id as string);
    await db().from("drivers").update({ status: "AVAILABLE" }).eq("id", driver.id as string).neq("status", "OFFLINE");
    await sendMessage(
      token,
      chatId,
      `🏁 <b>All pickups done!</b>\n━━━━━━━━━━━━━━\nDeliver the laundry to <b>${esc(store.name)}</b>.`,
      store.place ? { inline: [[{ text: "🗺 Navigate to the store", url: directionsUrl({ destination: store.place }) }]] } : {},
    );
  }

  // Photo proof (optional, Pro): the next photo this driver sends is attached to this pickup.
  if (!(await isPro(o.tenant_id as string))) return;
  await db().from("drivers").update({ photo_order_id: o.id as string }).eq("id", driver.id as string);
  await sendMessage(token, chatId, `📸 <b>Send one photo of the ${bags ? "bags" : "bag"}</b> for #${o.device_order_id}.\n<i>Proof of pickup: it protects you if anything is questioned later.</i>`, {
    inline: [[{ text: "Skip", callback_data: "skipphoto" }]],
  });
}

// Sorted pickup, one bag weighed (kg 0: no clothes of that kind). Whites first, then coloured; after the coloured
// bag the pickup completes with their sum. At least one bag must have clothes.
async function weighBag(token: string, driver: Row, o: Row, kind: "WHITES" | "COLOURED", kg: number) {
  const chatId = driver.telegram_chat_id as string;
  if (kind === "WHITES") {
    await db().from("orders").update({ whites_kg: kg }).eq("id", o.id as string).eq("driver_id", chatId).in("status", ACTIVE);
    await db().from("drivers").update({ weighing_step: "COLOURED" }).eq("id", driver.id as string);
    await sendMessage(
      token,
      chatId,
      `${kg ? `⚪ Whites: <b>${kg} kg</b> ✓` : "⚪ No whites ✓"}\n${LINE}\n🎨 <b>Now the coloured bag</b> <code>${bagTag(o.device_order_id as number, "COLOURED")}</code>\nSend its weight in kg, like <code>3.5</code>.`,
      { inline: [[{ text: "No coloured clothes", callback_data: `nocoloured:${o.id}` }]] },
    );
    return;
  }
  const whites = Number(o.whites_kg) || 0;
  const total = sortedTotal(whites, kg);
  if (total === null) {
    await sendMessage(token, chatId, "🙅 Both bags can't be empty. Send the coloured bag's weight, or start again with ✅ Picked up.");
    return;
  }
  await finishPickup(token, driver, o, total, "driver", undefined, { whitesKg: whites, colouredKg: kg });
}

async function handleButton(token: string, cb: NonNullable<TgUpdate["callback_query"]>) {
  const chatId = String(cb.from.id);
  if (cb.data === "skipphoto") {
    await db().from("drivers").update({ photo_order_id: null }).eq("telegram_chat_id", chatId);
    await answerCallback(token, cb.id, "No photo, that's fine");
    if (cb.message) await editMessage(token, String(cb.message.chat.id), cb.message.message_id, "📸 <i>No photo for this pickup.</i>");
    return;
  }
  const [action, orderId] = (cb.data ?? "").split(/:(.+)/);
  if (["dack", "dgot", "ddecline", "ddone", "dnocode", "dnothome", "dcash", "dnocash"].includes(action) && orderId) {
    return handleDeliveryButton(token, cb, action, orderId);
  }
  const driver = await driverByChat(chatId);
  const { data: o } = orderId ? await db().from("orders").select("*").eq("id", orderId).maybeSingle() : { data: null };
  // Only the driver who holds the pickup can act on it.
  if (!driver || !o || o.driver_id !== chatId || !ACTIVE.includes(o.status as string)) {
    await answerCallback(token, cb.id, "This pickup isn't yours anymore.");
    return;
  }
  const msg = cb.message;

  if (action === "ack") {
    await db().from("orders").update({ driver_ack_at: new Date().toISOString() }).eq("id", orderId).eq("driver_id", chatId).is("driver_ack_at", null);
    await answerCallback(token, cb.id, "👍 Thanks! The laundry can see you've got it.");
    if (msg) await editButtons(token, String(msg.chat.id), msg.message_id, assignmentButtons(o as Row, driver, await basketPoint(o.device_id as string), false));
    return;
  }

  if (action === "done") {
    if (!o.driver_ack_at) await db().from("orders").update({ driver_ack_at: new Date().toISOString() }).eq("id", orderId).is("driver_ack_at", null);
    const reported = Number(o.weight_kg) || 0;
    const { data: t } = await db().from("tenants").select("weigh_at_pickup, sort_whites").eq("id", o.tenant_id as string).maybeSingle();
    if (t?.weigh_at_pickup === false) {
      // the business doesn't weigh at pickup: the basket's reading stands
      await answerCallback(token, cb.id, "Marked as picked up ✅");
      await finishPickup(token, driver, o as Row, reported, "basket", msg);
      return;
    }
    if (t?.sort_whites && (await isPro(o.tenant_id as string))) {
      // sorted: whites and coloured clothes in two tagged bags, each weighed (whites first)
      await db().from("orders").update({ whites_kg: null, coloured_kg: null }).eq("id", orderId).eq("driver_id", chatId);
      await db().from("drivers").update({ weighing_order_id: orderId, weighing_step: "WHITES" }).eq("id", driver.id as string);
      await answerCallback(token, cb.id, "Sort and weigh the bags ⚖️");
      if (msg) await editMessage(token, String(msg.chat.id), msg.message_id, `⚖️ <b>Weighing</b> · #${o.device_order_id}\n${esc((o.address as string) || "")}`);
      await sendMessage(
        token,
        chatId,
        `🧺 <b>Two bags</b> · #${o.device_order_id}\n${LINE}\nPut <b>whites</b> and <b>coloured clothes</b> in separate bags and tag them ` +
          `<code>${bagTag(o.device_order_id as number, "WHITES")}</code> and <code>${bagTag(o.device_order_id as number, "COLOURED")}</code>.\n\n` +
          `⚪ <b>Weigh the whites bag first.</b> Send its weight in kg, like <code>2.5</code>.\nThe basket reported <b>${reported} kg</b> in total.`,
        {
          inline: [
            [{ text: "No whites", callback_data: `nowhites:${orderId}` }],
            [{ text: `No scale: use the basket's ${reported} kg`, callback_data: `basket:${orderId}` }],
          ],
        },
      );
      return;
    }
    // weigh-in: the next number this driver sends is the bag's weight
    await db().from("drivers").update({ weighing_order_id: orderId, weighing_step: null }).eq("id", driver.id as string);
    await answerCallback(token, cb.id, "Weigh the bag ⚖️");
    if (msg) await editMessage(token, String(msg.chat.id), msg.message_id, `⚖️ <b>Weighing</b> · #${o.device_order_id}\n${esc((o.address as string) || "")}`);
    await sendMessage(
      token,
      chatId,
      `⚖️ <b>Weigh the bag</b> · #${o.device_order_id}\n${LINE}\nSend the weight on your scale in kg, like <code>6.4</code>.\nThe basket reported <b>${reported} kg</b>.`,
      { inline: [[{ text: `No scale: use the basket's ${reported} kg`, callback_data: `basket:${orderId}` }]] },
    );
  } else if (
    (action === "nowhites" || action === "nocoloured") &&
    driver.weighing_order_id === orderId &&
    driver.weighing_step === (action === "nowhites" ? "WHITES" : "COLOURED")
  ) {
    await answerCallback(token, cb.id, action === "nowhites" ? "No whites" : "No coloured clothes");
    await weighBag(token, driver, o as Row, action === "nowhites" ? "WHITES" : "COLOURED", 0);
  } else if (action === "basket") {
    await answerCallback(token, cb.id, "Using the basket's reading");
    await finishPickup(token, driver, o as Row, Number(o.weight_kg) || 0, "basket", msg);
  } else if (action === "decline") {
    await db()
      .from("orders")
      .update({ driver_id: null, status: "PENDING", assigned_at: null, declined_by: [...((o.declined_by as string[]) ?? []), chatId] })
      .eq("id", orderId);
    await answerCallback(token, cb.id, "Passed on. We'll find another driver.");
    if (msg) await editMessage(token, String(msg.chat.id), msg.message_id, `↩️ <i>You passed on #${o.device_order_id}. We'll find another driver.</i>`);
    const { count } = await db().from("orders").select("id", { count: "exact", head: true }).eq("driver_id", chatId).in("status", ACTIVE);
    if (!count) await db().from("drivers").update({ status: "AVAILABLE" }).eq("id", driver.id as string).neq("status", "OFFLINE");
    await dispatchOrder(orderId);
  } else {
    await answerCallback(token, cb.id);
  }
}
