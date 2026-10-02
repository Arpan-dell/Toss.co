import "server-only";
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
import { chooseDriver, directionsUrl, routeUrl, searchUrl, type DriverCandidate, type LatLng } from "./core";
import { geocode } from "./geocode";
import { MAX_KG, MIN_KG, parseKg, repriceForWeight } from "./weighing";
import { logError } from "@/lib/log";

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
    .select("id, tenant_id, name, telegram_chat_id, status, last_lat, last_lng, location_at, route_token, weighing_order_id")
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
    ? await db().from("customers").select("name, phone").eq("id", order.customer_id as string).maybeSingle()
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
  await sendMessage(token, chatId, lines.join("\n"), { inline: buttons });
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
    [{ text: "📋 My pickups" }, { text: "🛣 My route" }],
    [{ text: "👤 My status" }],
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
  "🛣 <b>My route</b>: every stop in order, ending at the store",
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
  const [{ count: open }, { count: done }, store] = await Promise.all([
    db().from("orders").select("id", { count: "exact", head: true }).eq("driver_id", chatId).in("status", ACTIVE),
    db().from("orders").select("id", { count: "exact", head: true }).eq("driver_id", chatId).eq("status", "COMPLETED").gte("completed_at", startOfTodayIST()),
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
    `🧺 Open pickups: <b>${open ?? 0}</b>`,
    `✅ Done today: <b>${done ?? 0}</b>`,
    ...(!fresh && driver.status !== "OFFLINE" ? ["", "<i>Share your live location so you get the nearest pickups.</i>"] : []),
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

  const text = (msg.text ?? "").trim();

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
  } else if (text === "🛣 My route" || text === "/route") {
    const r = await currentRoute(driver);
    await sendMessage(
      token,
      chatId,
      r.url ? `🛣 <b>Your route</b>\n${LINE}\n${r.stops} pickup${r.stops > 1 ? "s" : ""}, then the store 🏁\n<i>The link stays up to date as pickups change.</i>` : "🛣 No open pickups right now.",
      r.url ? { inline: [[{ text: "🗺 Open route in Google Maps", url: routeLink(driver) }]] } : { keyboard: MENU },
    );
  } else if (text === "📋 My pickups" || text === "/pickups") {
    const { data: jobs } = await db()
      .from("orders")
      .select("id, device_id, device_order_id, address, weight_kg, customer_id")
      .eq("driver_id", chatId)
      .in("status", ACTIVE)
      .order("assigned_at");
    if (!jobs?.length) {
      await sendMessage(token, chatId, "📋 No open pickups. Stay 🟢 online and new ones will come here.", { keyboard: MENU });
    } else {
      await sendMessage(token, chatId, `📋 <b>Your pickups</b> (${jobs.length})`, { keyboard: MENU });
      const ids = jobs.map((j) => j.customer_id as string | null).filter((v): v is string => !!v);
      const { data: people } = ids.length ? await db().from("customers").select("id, phone").in("id", ids) : { data: [] };
      const phoneOf = new Map((people ?? []).map((p: Row) => [p.id as string, p.phone as string | null]));
      for (const j of jobs) {
        await sendMessage(token, chatId, pickupCard(j, "Pickup", phoneOf.get(j.customer_id as string)), { inline: pickupButtons(j, searchUrl(j.address as string)) });
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
async function finishPickup(token: string, driver: Row, o: Row, kg: number, source: "driver" | "basket", msg?: { chat: { id: number }; message_id: number }) {
  const chatId = driver.telegram_chat_id as string;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: "COMPLETED",
    completed_at: now,
    weight_source: source,
    reported_weight_kg: o.reported_weight_kg ?? o.weight_kg,
  };
  if (source === "driver") Object.assign(patch, { weight_kg: kg, weighed_kg: kg, weighed_at: now });
  if (source === "driver" && o.payment_status === "UNPAID") {
    const { data: t } = await db().from("tenants").select("price_per_kg").eq("id", o.tenant_id as string).maybeSingle();
    const priced = repriceForWeight(
      {
        weightKg: Number(o.weight_kg) || 0,
        amountDue: Number(o.amount_due) || 0,
        amountBeforeDiscount: o.amount_before_discount as number | null,
        discountPct: o.discount_pct as number | null,
      },
      kg,
      Number(t?.price_per_kg) || 0,
    );
    Object.assign(patch, { amount_due: priced.amountDue, amount_before_discount: priced.amountBeforeDiscount });
  }
  const { data: done } = await db().from("orders").update(patch).eq("id", o.id as string).eq("driver_id", chatId).in("status", ACTIVE).select("amount_due");
  await db().from("drivers").update({ weighing_order_id: null }).eq("id", driver.id as string);
  if (!done?.length) {
    await sendMessage(token, chatId, "This pickup was already closed.", { keyboard: MENU });
    return;
  }
  const amount = Math.round(Number(done[0].amount_due) || 0);
  const weighed = source === "driver" ? `⚖️ ${kg} kg weighed` : `⚖️ ${kg} kg (basket reading)`;
  if (msg) await editMessage(token, String(msg.chat.id), msg.message_id, `✅ <b>Picked up</b> · #${o.device_order_id}\n<s>${esc((o.address as string) || "")}</s>`);
  await sendMessage(token, chatId, `✅ <b>Picked up</b> · #${o.device_order_id}\n${weighed} · ₹${amount}`, { keyboard: MENU });
  await notifyCustomer(
    o,
    `✅ Your laundry has been picked up (order #${o.device_order_id}).\n${source === "driver" ? `⚖️ Weighed at pickup: <b>${kg} kg</b>` : `⚖️ ${kg} kg`} · <b>₹${amount}</b>\nThank you!`,
  ).catch(() => {});

  const r = await currentRoute(driver);
  if (r.url) {
    await sendMessage(token, chatId, `👍 Nice! <b>${r.stops} more pickup${r.stops > 1 ? "s" : ""}</b> to go.`, {
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
    const reported = Number(o.weight_kg) || 0;
    const { data: t } = await db().from("tenants").select("weigh_at_pickup").eq("id", o.tenant_id as string).maybeSingle();
    if (t?.weigh_at_pickup === false) {
      // the business doesn't weigh at pickup: the basket's reading stands
      await answerCallback(token, cb.id, "Marked as picked up ✅");
      await finishPickup(token, driver, o as Row, reported, "basket", msg);
      return;
    }
    // weigh-in: the next number this driver sends is the bag's weight
    await db().from("drivers").update({ weighing_order_id: orderId }).eq("id", driver.id as string);
    await answerCallback(token, cb.id, "Weigh the bag ⚖️");
    if (msg) await editMessage(token, String(msg.chat.id), msg.message_id, `⚖️ <b>Weighing</b> · #${o.device_order_id}\n${esc((o.address as string) || "")}`);
    await sendMessage(
      token,
      chatId,
      `⚖️ <b>Weigh the bag</b> · #${o.device_order_id}\n${LINE}\nSend the weight on your scale in kg, like <code>6.4</code>.\nThe basket reported <b>${reported} kg</b>.`,
      { inline: [[{ text: `No scale: use the basket's ${reported} kg`, callback_data: `basket:${orderId}` }]] },
    );
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
