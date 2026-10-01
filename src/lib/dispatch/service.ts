import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { orderLabel } from "../format";
import { supabaseAdmin } from "../supabase/admin";
import * as api from "../telegram-api";
import { fromTelegramPhone } from "../phone";
import { esc, type InlineButton } from "../telegram-api";

// Telegram messages are best-effort: a failed send (network blip, a driver who blocked the bot)
// must never stop an assignment, a hand-over or a pickup from being recorded.
const safe = <A extends unknown[]>(fn: (...args: A) => Promise<unknown>) => (...args: A) =>
  fn(...args).catch((err) => {
    console.error("telegram send failed", err instanceof Error ? err.message : err);
    return undefined;
  });
const sendMessage = safe(api.sendMessage);
const sendLocation = safe(api.sendLocation);
const editMessage = safe(api.editMessage);
const answerCallback = safe(api.answerCallback);
import { chooseDriver, directionsUrl, routeUrl, searchUrl, type DriverCandidate, type LatLng } from "./core";
import { geocode } from "./geocode";

// Automatic pickup dispatch over the driver bot. Runs server-side with the service role:
// it crosses customers, baskets and drivers inside one business, and is triggered by trusted events
// (a new order from ingest, a manager action, or a verified Telegram webhook).

const SITE = process.env.SITE_URL ?? "https://toss-code-x-a24a.vercel.app";
const driverToken = () => process.env.TELEGRAM_DRIVER_BOT_TOKEN;
const customerToken = () => process.env.TELEGRAM_CUSTOMER_BOT_TOKEN;
export const dispatchEnabled = () => !!driverToken();

type Row = Record<string, unknown>;
const db = (): SupabaseClient => supabaseAdmin();
const ACTIVE = ["PENDING", "ACCEPTED"];

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
  const load = new Map<string, number>();
  for (const j of jobs ?? []) load.set(j.driver_id as string, (load.get(j.driver_id as string) ?? 0) + 1);
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
    .select("id, tenant_id, name, telegram_chat_id, status, last_lat, last_lng, location_at, route_token")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();
  return data as Row | null;
}

/** The driver's current route as a Google Maps link, or null when they have no open pickups. */
export async function currentRoute(driver: Row): Promise<{ url: string | null; stops: number }> {
  const { data: jobs } = await db()
    .from("orders")
    .select("device_id, address")
    .eq("driver_id", driver.telegram_chat_id as string)
    .in("status", ACTIVE);
  const pickups = await Promise.all((jobs ?? []).map(async (j: Row) => ({ point: await basketPoint(j.device_id as string), address: j.address as string })));
  if (!pickups.length) return { url: null, stops: 0 };
  const store = await storeOf(driver.tenant_id as string);
  const here = driver.last_lat != null ? { lat: driver.last_lat as number, lng: driver.last_lng as number } : undefined;
  return { url: routeUrl({ driver: here, pickups, store: store.place }), stops: pickups.length };
}

export async function routeByToken(token: string) {
  const { data } = await db().from("drivers").select("tenant_id, name, telegram_chat_id, last_lat, last_lng").eq("route_token", token).maybeSingle();
  return data ? { driver: data as Row, ...(await currentRoute(data as Row)) } : null;
}

const routeLink = (d: Row) => `${SITE}/r/${d.route_token as string}`;

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
    .update({ driver_id: choice.driver.chatId, status: "ACCEPTED", accepted_at: o.accepted_at ?? now, assigned_at: now })
    .eq("id", orderId)
    .is("driver_id", null)
    .select("id");
  if (!won?.length) return { assigned: false, reason: "assigned concurrently" };
  await db().from("drivers").update({ status: "ON_JOB" }).eq("id", choice.driver.id);

  await notifyAssignment(o as Row, choice.driver.chatId, pickup).catch((e) => console.error("driver notify failed", e));
  await notifyCustomer(o as Row, `🚚 <b>${esc(choice.driver.name)}</b> is on the way to pick up your laundry (order #${o.device_order_id}).`).catch(
    (e) => console.error("customer notify failed", e),
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
    else if (r.reason === "no driver available") break;
  }
  return placed;
}

/** Tells a driver about a pickup they've been given (also used for manual assignment from the dashboard). */
export async function notifyAssignment(order: Row, chatId: string, pickup?: LatLng) {
  const token = driverToken();
  if (!token) return;
  const driver = await driverByChat(chatId);
  const store = await storeOf(order.tenant_id as string);
  const { data: c } = order.customer_id
    ? await db().from("customers").select("name").eq("id", order.customer_id as string).maybeSingle()
    : { data: null };

  if (pickup) await sendLocation(token, chatId, pickup.lat, pickup.lng);
  const id = order.id as string;
  const buttons: InlineButton[][] = [
    [{ text: "🗺 Navigate to pickup", url: pickup ? directionsUrl({ destination: pickup }) : searchUrl(order.address as string) }],
    ...(driver ? [[{ text: "🛣 My full route (always up to date)", url: routeLink(driver) }]] : []),
    [
      { text: "✅ Picked up", callback_data: `done:${id}` },
      { text: "↩️ Can't take it", callback_data: `decline:${id}` },
    ],
  ];
  const lines = [
    `🧺 <b>New pickup</b> · ${esc(orderLabel({ deviceId: order.device_id as string, deviceOrderId: order.device_order_id as number }))}`,
    `📍 ${esc((order.address as string) || "Address not set")}`,
    c?.name ? `👤 ${esc(c.name as string)}` : null,
    `⚖️ ${Number(order.weight_kg).toFixed(1)} kg`,
    store.place ? `🏁 Then deliver to <b>${esc(store.name)}</b>` : null,
  ].filter(Boolean);
  await sendMessage(token, chatId, lines.join("\n"), { inline: buttons });
}

async function notifyCustomer(order: Row, text: string) {
  const token = customerToken();
  const chat = order.customer_telegram_id as string | null;
  if (token && chat) await sendMessage(token, chat, text);
}

// ---------- driver bot ----------

const MENU = {
  keyboard: [[{ text: "🟢 Online" }, { text: "🔴 Offline" }], [{ text: "🛣 My route" }, { text: "📋 My pickups" }]],
  resize_keyboard: true,
  is_persistent: true,
};

const SHARE_PHONE = {
  keyboard: [[{ text: "📱 Share my phone number", request_contact: true }]],
  resize_keyboard: true,
  is_persistent: true,
};

const WELCOME = (name: string) =>
  `Hi ${esc(name)} 👋 You're a Toss driver.\n\n1. Tap <b>🟢 Online</b> when you're working.\n2. Share your <b>live location</b> (📎 → Location → Share live location) so you get the nearest pickups.\n3. Each pickup comes with a Google Maps button. <b>🛣 My route</b> always shows every stop, ending at the store.`;

// The driver shared their contact with the request_contact button. Telegram only lets people share
// their own number that way (contact.user_id is the sender), so the number is genuine; we attach this
// chat to the driver the manager added with that number.
async function connectByPhone(token: string, chatId: string, msg: TgMessage) {
  const contact = msg.contact!;
  const phone = fromTelegramPhone(contact.phone_number);
  if (!phone || contact.user_id === undefined || contact.user_id !== msg.from?.id) {
    await sendMessage(token, chatId, "Please share <b>your own</b> number with the button below.", { keyboard: SHARE_PHONE });
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
      `No laundry has added <b>${esc(phone)}</b> as a driver yet. Ask your manager to add you on Toss (Fleet → Add driver) with this number, then tap the button again.`,
      { keyboard: SHARE_PHONE },
    );
    return;
  }
  await sendMessage(token, chatId, `✅ Connected!\n\n${WELCOME(won.name as string)}`, { keyboard: MENU });
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
    await sendMessage(
      token,
      chatId,
      "👋 Welcome to <b>Toss</b> for drivers!\n\nTap <b>📱 Share my phone number</b> below. If your laundry added you with this number, you're connected right away.",
      { keyboard: SHARE_PHONE },
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
          ? "📍 Live location on. You'll get the pickups nearest to you."
          : "📍 Got it. For automatic nearest pickups, share your <b>live</b> location (📎 → Location → Share live location).",
        { keyboard: MENU },
      );
      if (driver.status !== "OFFLINE") await dispatchWaiting(driver.tenant_id as string);
    }
    return;
  }

  const text = (msg.text ?? "").trim();
  if (text === "/start" || text === "/help") {
    await sendMessage(token, chatId, WELCOME(driver.name as string), { keyboard: MENU });
  } else if (text === "🟢 Online" || text === "/online") {
    await db().from("drivers").update({ status: "AVAILABLE" }).eq("id", driver.id as string);
    const placed = await dispatchWaiting(driver.tenant_id as string);
    await sendMessage(token, chatId, placed ? `🟢 You're online. ${placed} waiting pickup${placed > 1 ? "s" : ""} assigned.` : "🟢 You're online. New pickups will come here.", { keyboard: MENU });
  } else if (text === "🔴 Offline" || text === "/offline") {
    await db().from("drivers").update({ status: "OFFLINE" }).eq("id", driver.id as string);
    await sendMessage(token, chatId, "🔴 You're offline. You won't get new pickups. Finish any open ones from 📋 My pickups.", { keyboard: MENU });
  } else if (text === "🛣 My route" || text === "/route") {
    const r = await currentRoute(driver);
    await sendMessage(
      token,
      chatId,
      r.url ? `🛣 ${r.stops} pickup${r.stops > 1 ? "s" : ""}, then the store.` : "No open pickups right now.",
      r.url ? { inline: [[{ text: "🗺 Open route in Google Maps", url: routeLink(driver) }]] } : { keyboard: MENU },
    );
  } else if (text === "📋 My pickups" || text === "/pickups") {
    const { data: jobs } = await db()
      .from("orders")
      .select("id, device_id, device_order_id, address, weight_kg")
      .eq("driver_id", chatId)
      .in("status", ACTIVE)
      .order("assigned_at");
    if (!jobs?.length) {
      await sendMessage(token, chatId, "No open pickups.", { keyboard: MENU });
    } else {
      for (const j of jobs) {
        await sendMessage(token, chatId, `🧺 #${j.device_order_id} · ${Number(j.weight_kg).toFixed(1)} kg\n📍 ${esc((j.address as string) || "—")}`, {
          inline: [
            [{ text: "🗺 Navigate", url: searchUrl(j.address as string) }],
            [
              { text: "✅ Picked up", callback_data: `done:${j.id}` },
              { text: "↩️ Can't take it", callback_data: `decline:${j.id}` },
            ],
          ],
        });
      }
    }
  } else {
    await sendMessage(token, chatId, "Use the buttons below.", { keyboard: MENU });
  }
}

async function handleButton(token: string, cb: NonNullable<TgUpdate["callback_query"]>) {
  const chatId = String(cb.from.id);
  const [action, orderId] = (cb.data ?? "").split(/:(.+)/);
  const driver = await driverByChat(chatId);
  const { data: o } = orderId ? await db().from("orders").select("*").eq("id", orderId).maybeSingle() : { data: null };
  // Only the driver who holds the pickup can act on it.
  if (!driver || !o || o.driver_id !== chatId || !ACTIVE.includes(o.status as string)) {
    await answerCallback(token, cb.id, "This pickup isn't yours anymore.");
    return;
  }
  const msg = cb.message;

  if (action === "done") {
    await db().from("orders").update({ status: "COMPLETED", completed_at: new Date().toISOString() }).eq("id", orderId);
    await answerCallback(token, cb.id, "Marked as picked up ✅");
    if (msg) await editMessage(token, String(msg.chat.id), msg.message_id, `✅ Picked up #${o.device_order_id} · ${esc((o.address as string) || "")}`);
    await notifyCustomer(o as Row, `✅ Your laundry has been picked up (order #${o.device_order_id}). Thank you!`).catch(() => {});
    const r = await currentRoute(driver);
    if (r.url) {
      await sendMessage(token, chatId, `Next: ${r.stops} more pickup${r.stops > 1 ? "s" : ""}.`, {
        inline: [[{ text: "🛣 Continue route", url: routeLink(driver) }]],
      });
    } else {
      const store = await storeOf(driver.tenant_id as string);
      await db().from("drivers").update({ status: "AVAILABLE" }).eq("id", driver.id as string).neq("status", "OFFLINE");
      await sendMessage(
        token,
        chatId,
        `🏁 All pickups done. Deliver to <b>${esc(store.name)}</b>.`,
        store.place ? { inline: [[{ text: "🗺 Navigate to the store", url: directionsUrl({ destination: store.place }) }]] } : {},
      );
    }
  } else if (action === "decline") {
    await db()
      .from("orders")
      .update({ driver_id: null, status: "PENDING", assigned_at: null, declined_by: [...((o.declined_by as string[]) ?? []), chatId] })
      .eq("id", orderId);
    await answerCallback(token, cb.id, "Passed on. We'll find another driver.");
    if (msg) await editMessage(token, String(msg.chat.id), msg.message_id, `↩️ You passed on #${o.device_order_id}.`);
    const { count } = await db().from("orders").select("id", { count: "exact", head: true }).eq("driver_id", chatId).in("status", ACTIVE);
    if (!count) await db().from("drivers").update({ status: "AVAILABLE" }).eq("id", driver.id as string).neq("status", "OFFLINE");
    await dispatchOrder(orderId);
  } else {
    await answerCallback(token, cb.id);
  }
}
