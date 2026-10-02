/**
 * Live end-to-end check of automatic driver dispatch against the deployed site.
 * Simulates Telegram webhook updates from two fake drivers (Telegram would send these), places an
 * order through ingest, and checks assignment, hand-over on decline, pickup and the route link.
 * Creates throwaway data and deletes it afterwards. Telegram sends to the fake chats simply fail.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=… TOSS_BRIDGE_KEY=… TELEGRAM_DRIVER_WEBHOOK_SECRET=… npx tsx scripts/e2e-dispatch.ts
 */
import { createClient } from "@supabase/supabase-js";
import { need } from "./env";

const SITE = process.env.TOSS_SITE ?? "https://toss-code-x-a24a.vercel.app";
const SB_URL = need("NEXT_PUBLIC_SUPABASE_URL");
const must = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Set ${k}`);
  return v;
};
const admin = createClient(SB_URL, must("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const BRIDGE = must("TOSS_BRIDGE_KEY");
const SECRET = must("TELEGRAM_DRIVER_WEBHOOK_SECRET");

const NEAR = "7199000001"; // near Saket
const FAR = "7199000002"; // in Dwarka
const STRANGER = "7199000009"; // not a registered driver
const CUSTOMER_TG = "9999999993";
const SAKET = { lat: 28.5245, lng: 77.2066 };
const DWARKA = { lat: 28.5921, lng: 77.046 };
const STORE = { lat: 28.5677, lng: 77.2433 }; // Lajpat Nagar

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

let updateId = 1;
async function telegram(update: Record<string, unknown>, secret = SECRET) {
  const res = await fetch(`${SITE}/api/telegram/driver-webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify({ update_id: updateId++, ...update }),
  });
  return res.status;
}
const text = (chat: string, t: string) => telegram({ message: { message_id: updateId, chat: { id: Number(chat), type: "private" }, text: t } });
const location = (chat: string, p: { lat: number; lng: number }) =>
  telegram({ message: { message_id: updateId, chat: { id: Number(chat), type: "private" }, location: { latitude: p.lat, longitude: p.lng, live_period: 3600 } } });
const button = (chat: string, data: string) =>
  telegram({ callback_query: { id: String(updateId), data, from: { id: Number(chat) }, message: { message_id: 1, chat: { id: Number(chat) } } } });

async function main() {
  const users: string[] = [];
  let tenantId = "";
  try {
    // ---- a business with a store, two drivers and a customer ----
    const mk = async (tag: string) => {
      const { data, error } = await admin.auth.admin.createUser({ email: `dsp-${tag}-${Date.now()}@toss-test.invalid`, password: `x-${Date.now()}`, email_confirm: true });
      if (error) throw error;
      users.push(data.user.id);
      return data.user.id;
    };
    const mgr = await mk("mgr");
    const cust = await mk("cust");
    const reg = await admin.rpc("register_business", { p_user: mgr, p_name: "Dispatch Test", p_upi_id: "dsp@okaxis", p_upi_name: "DT", p_price: 50 });
    if (reg.error) throw reg.error;
    tenantId = (reg.data as { tenant_id: string }).tenant_id;
    await admin.from("tenants").update({ store_address: "Lajpat Nagar, New Delhi", store_lat: STORE.lat, store_lng: STORE.lng }).eq("id", tenantId);
    await admin.from("drivers").insert([
      { tenant_id: tenantId, name: "Near", telegram_chat_id: NEAR, status: "OFFLINE" },
      { tenant_id: tenantId, name: "Far", telegram_chat_id: FAR, status: "OFFLINE" },
    ]);
    await admin.from("customers").update({ tenant_id: tenantId, telegram_id: CUSTOMER_TG }).eq("id", cust);

    // ---- webhook security ----
    check("webhook: wrong secret rejected", (await telegram({ message: { text: "/start" } }, "wrong")) === 401);
    check("webhook: unregistered driver gets a reply (200)", (await text(STRANGER, "/start")) === 200);

    // ---- drivers go online and share live location ----
    check("bot: Near goes online", (await text(NEAR, "🟢 Online")) === 200);
    check("bot: Far goes online", (await text(FAR, "/online")) === 200);
    await location(NEAR, SAKET);
    await location(FAR, DWARKA);
    const { data: ds } = await admin.from("drivers").select("telegram_chat_id, status, last_lat, location_at").eq("tenant_id", tenantId);
    check(
      "bot: status and live location stored",
      (ds ?? []).every((d) => d.status === "AVAILABLE" && d.last_lat != null && d.location_at != null),
      JSON.stringify(ds?.map((d) => [d.telegram_chat_id, d.status, d.last_lat])),
    );

    // ---- a basket fills up in Saket → nearest driver ----
    const res = await fetch(`${SITE}/api/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-key": BRIDGE },
      body: JSON.stringify({ orderId: 800, customerId: CUSTOMER_TG, address: "Saket, New Delhi", weight: 5, status: "PENDING" }),
    });
    const body = (await res.json()) as { dispatch?: { assigned: boolean; driver?: string; reason?: string } };
    check("dispatch: new pickup assigned on arrival", res.status === 200 && body.dispatch?.assigned === true, JSON.stringify(body.dispatch));
    const orderId = `legacy-${CUSTOMER_TG}#800`;
    let { data: o } = await admin.from("orders").select("driver_id, status, assigned_at").eq("id", orderId).single();
    check("dispatch: went to the nearest driver (Saket, not Dwarka)", o?.driver_id === NEAR && o?.status === "ACCEPTED" && !!o?.assigned_at, JSON.stringify(o));
    const { data: dev } = await admin.from("devices").select("lat, lng").eq("device_id", `legacy-${CUSTOMER_TG}`).single();
    check("geocode: pickup address placed on the map", dev?.lat != null && Math.abs(dev.lat - SAKET.lat) < 0.1, JSON.stringify(dev));
    const { data: near } = await admin.from("drivers").select("status, route_token").eq("telegram_chat_id", NEAR).single();
    check("dispatch: driver marked on a job", near?.status === "ON_JOB");

    // ---- the always-current route link ----
    const route = await fetch(`${SITE}/r/${near!.route_token}`, { redirect: "manual" });
    const loc = new URL(route.headers.get("location") ?? "https://x");
    check(
      "route: /r/<token> opens Google Maps driver → pickup → store",
      route.status === 302 &&
        loc.hostname === "www.google.com" &&
        loc.searchParams.get("origin") === "28.524500,77.206600" &&
        loc.searchParams.get("destination") === "28.567700,77.243300" &&
        !!loc.searchParams.get("waypoints"),
      route.headers.get("location") ?? `status ${route.status}`,
    );
    check("route: unknown token is 404", (await fetch(`${SITE}/r/${"0".repeat(36)}`, { redirect: "manual" })).status === 404);

    // ---- someone else can't act on the pickup ----
    await button(FAR, `done:${orderId}`);
    ({ data: o } = await admin.from("orders").select("driver_id, status").eq("id", orderId).single());
    check("bot: another driver can't mark it picked up", o?.status === "ACCEPTED" && o?.driver_id === NEAR);

    // ---- Near passes → goes to the next driver ----
    await button(NEAR, `decline:${orderId}`);
    const { data: o2 } = await admin.from("orders").select("driver_id, status, declined_by").eq("id", orderId).single();
    check("decline: handed to the next driver", o2?.driver_id === FAR && o2?.status === "ACCEPTED" && (o2?.declined_by ?? []).includes(NEAR), JSON.stringify(o2));
    const { data: nearAfter } = await admin.from("drivers").select("status").eq("telegram_chat_id", NEAR).single();
    check("decline: declining driver is available again", nearAfter?.status === "AVAILABLE");

    // ---- Far picks it up ----
    await button(FAR, `done:${orderId}`);
    const { data: o3 } = await admin.from("orders").select("status, completed_at").eq("id", orderId).single();
    check("pickup: driver marks it picked up", o3?.status === "COMPLETED" && !!o3?.completed_at);
    const { data: farAfter } = await admin.from("drivers").select("status").eq("telegram_chat_id", FAR).single();
    check("pickup: driver free again after the last stop", farAfter?.status === "AVAILABLE");

    // ---- nobody online → order waits, then goes out when a driver comes online ----
    await text(NEAR, "🔴 Offline");
    await text(FAR, "🔴 Offline");
    const res2 = await fetch(`${SITE}/api/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-key": BRIDGE },
      body: JSON.stringify({ orderId: 801, customerId: CUSTOMER_TG, address: "Saket, New Delhi", weight: 4, status: "PENDING" }),
    });
    const b2 = (await res2.json()) as { dispatch?: { assigned: boolean; reason?: string } };
    check("waiting: no online driver → order waits", b2.dispatch?.assigned === false, JSON.stringify(b2.dispatch));
    await text(FAR, "🟢 Online");
    const { data: o4 } = await admin.from("orders").select("driver_id").eq("id", `legacy-${CUSTOMER_TG}#801`).single();
    check("waiting: assigned as soon as a driver comes online", o4?.driver_id === FAR, JSON.stringify(o4));
  } finally {
    await admin.from("orders").delete().eq("device_id", `legacy-${CUSTOMER_TG}`);
    await admin.from("devices").delete().eq("device_id", `legacy-${CUSTOMER_TG}`);
    if (tenantId) {
      await admin.from("drivers").delete().eq("tenant_id", tenantId);
      await admin.from("customers").update({ tenant_id: null }).eq("tenant_id", tenantId);
      await admin.from("tenants").delete().eq("id", tenantId);
    }
    for (const id of users) await admin.auth.admin.deleteUser(id);
    console.log("cleaned up test data");
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
