/**
 * Seeds a business with realistic demo data so you can show Toss to someone, or removes it again.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/demo-data.ts B-XXXXXX            # add
 *   SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/demo-data.ts B-XXXXXX --remove   # remove
 *
 * Everything it creates is tagged so removal is exact:
 *   customers  → emails ending in @demo.toss.invalid (".invalid" can never receive mail)
 *   baskets    → device IDs starting with "demo-"
 *   drivers    → Telegram chat IDs starting with 7100…
 * Demo customers can sign in with the printed password (or DEMO_PASSWORD) to show the customer view.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { need } from "./env";

const SB_URL = need("NEXT_PUBLIC_SUPABASE_URL");
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Random per run (this repo is public); printed once at the end. Set DEMO_PASSWORD to choose one.
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? `Demo-${randomBytes(6).toString("base64url")}`;
const DEMO_DOMAIN = "@demo.toss.invalid";
if (!SECRET) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SB_URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });

// Deterministic randomness so the demo looks the same every time it's seeded.
let seed = 20261001;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

const CUSTOMERS = [
  { name: "Riya Sharma", area: "Saket", address: "C-12, Saket, New Delhi", target: 5 },
  { name: "Aarav Mehta", area: "Hauz Khas", address: "B-4/11, Hauz Khas, New Delhi", target: 6 },
  { name: "Diya Kapoor", area: "Vasant Kunj", address: "Flat 302, Sector C, Vasant Kunj", target: 5 },
  { name: "Kabir Singh", area: "Rajouri Garden", address: "J-7, Rajouri Garden, New Delhi", target: 8 },
  { name: "Meera Nair", area: "Dwarka", address: "House 19, Sector 6, Dwarka", target: 7 },
  { name: "Rohan Gupta", area: "Lajpat Nagar", address: "II-M/32, Lajpat Nagar, New Delhi", target: 5 },
  { name: "Ananya Iyer", area: "Greater Kailash", address: "S-210, GK-II, New Delhi", target: 6 },
  { name: "Vihaan Das", area: "Karol Bagh", address: "16/7, WEA Karol Bagh, New Delhi", target: 5 },
];
const DRIVERS = [
  { name: "Vikram", chat: "7100000001", status: "ON_JOB" },
  { name: "Suresh", chat: "7100000002", status: "AVAILABLE" },
  { name: "Imran", chat: "7100000003", status: "AVAILABLE" },
];
// Relative chance of a basket filling on each weekday (Sun..Sat): weekends are busiest.
const WEEKDAY_WEIGHT = [1.7, 0.9, 0.7, 0.8, 0.85, 1.0, 1.8];

const emailFor = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, ".") + DEMO_DOMAIN;
const utr = () => String(Math.floor(100000000000 + rand() * 899999999999));

async function findTenant(code: string) {
  const { data, error } = await admin.from("tenants").select("id, name, price_per_kg").eq("join_code", code).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No business with ID ${code}`);
  return data as { id: string; name: string; price_per_kg: number };
}

async function remove(tenantId: string) {
  const { data: devices } = await admin.from("devices").select("device_id").eq("tenant_id", tenantId).like("device_id", "demo-%");
  const ids = (devices ?? []).map((d) => d.device_id as string);
  if (ids.length) {
    await admin.from("orders").delete().in("device_id", ids);
    await admin.from("devices").delete().in("device_id", ids);
  }
  await admin.from("drivers").delete().eq("tenant_id", tenantId).like("telegram_chat_id", "7100%");
  // demo supplies from supabase/demo/fresh-sorting-demo.sql
  await admin.from("supplies").delete().eq("tenant_id", tenantId).like("name", "% (demo)");
  const { data: users } = await admin.from("customers").select("id, email").like("email", `%${DEMO_DOMAIN}`);
  for (const u of users ?? []) await admin.auth.admin.deleteUser(u.id as string);
  console.log(`Removed ${ids.length} demo baskets, their orders, demo drivers and ${users?.length ?? 0} demo customers.`);
}

async function add(tenant: { id: string; name: string; price_per_kg: number }) {
  const now = Date.now();
  const price = tenant.price_per_kg;

  // ---- drivers ----
  const { error: dErr } = await admin
    .from("drivers")
    .upsert(DRIVERS.map((d) => ({ tenant_id: tenant.id, name: d.name, telegram_chat_id: d.chat, status: d.status })), {
      onConflict: "telegram_chat_id",
    });
  if (dErr) throw dErr;

  const orders: Record<string, unknown>[] = [];
  let i = 0;
  for (const c of CUSTOMERS) {
    i++;
    const telegramId = `70000000${String(i).padStart(2, "0")}`;
    const deviceId = `demo-basket-${String(i).padStart(2, "0")}`;

    // ---- customer account (joined to this business, Telegram linked) ----
    const email = emailFor(c.name);
    let userId: string;
    const created = await admin.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { full_name: c.name } });
    if (created.error) {
      const { data: existing } = await admin.from("customers").select("id").eq("email", email).maybeSingle();
      if (!existing) throw created.error;
      userId = existing.id as string;
    } else userId = created.data.user.id;
    await admin.from("customers").update({ tenant_id: tenant.id, telegram_id: telegramId }).eq("id", userId);

    // ---- basket: most report a heartbeat "now"; seen far ahead so they still show online during a demo ----
    const online = i <= 6;
    await admin.from("devices").upsert(
      {
        device_id: deviceId,
        tenant_id: tenant.id,
        customer_id: userId,
        owner_telegram_id: telegramId,
        address: c.address,
        area: c.area,
        target_kg: c.target,
        last_weight_kg: Math.round(rand() * c.target * 0.95 * 10) / 10,
        last_seen_at: new Date(online ? now + 7 * 86_400_000 : now - (2 + i) * 3_600_000).toISOString(),
        firmware_version: i <= 5 ? "2.0.0" : "1.0.0",
        wifi_rssi: -45 - Math.floor(rand() * 35),
      },
      { onConflict: "device_id" },
    );

    // ---- ~10 weeks of completed pickups ----
    let n = 100;
    for (let d = 70; d >= 1; d--) {
      const day = new Date(now - d * 86_400_000);
      if (rand() > 0.17 * WEEKDAY_WEIGHT[day.getUTCDay()]) continue;
      day.setUTCHours(2 + Math.floor(rand() * 13), Math.floor(rand() * 60), 0, 0); // 07:30–20:30 IST
      const weight = Math.round((c.target + rand() * 1.5) * 100) / 100;
      const accepted = new Date(day.getTime() + (6 + rand() * 30) * 60_000);
      const completed = new Date(accepted.getTime() + (25 + rand() * 120) * 60_000);
      const recent = d <= 5;
      const roll = rand();
      // Older invoices are paid; the last few days have a mix of unpaid and awaiting confirmation.
      const pay = !recent
        ? roll < 0.85
          ? { payment_status: "PAID", payment_method: "UPI", payment_ref: utr() }
          : { payment_status: "PAID", payment_method: "CASH", payment_ref: null }
        : roll < 0.4
          ? { payment_status: "UNPAID", payment_method: null, payment_ref: null }
          : roll < 0.7
            ? { payment_status: "PENDING", payment_method: "UPI", payment_ref: utr(), payment_reported_at: new Date(completed.getTime() + 3_600_000).toISOString() }
            : { payment_status: "PAID", payment_method: "UPI", payment_ref: utr() };
      orders.push({
        id: `${deviceId}#${n}`,
        device_order_id: n++,
        device_id: deviceId,
        tenant_id: tenant.id,
        customer_id: userId,
        customer_telegram_id: telegramId,
        driver_id: pick(DRIVERS).chat,
        address: c.address,
        weight_kg: weight,
        status: "COMPLETED",
        amount_due: Math.round(weight * price),
        placed_at: day.toISOString(),
        accepted_at: accepted.toISOString(),
        completed_at: completed.toISOString(),
        payment_confirmed_at: pay.payment_status === "PAID" ? new Date(completed.getTime() + 2 * 3_600_000).toISOString() : null,
        ...pay,
      });
    }

    // The demo login (first customer) always has one invoice to pay and one awaiting confirmation,
    // so the UPI flow can be shown from both sides.
    if (i === 1) {
      const mine = orders.filter((o) => o.device_id === deviceId);
      const [last, prev] = [mine[mine.length - 1], mine[mine.length - 2]];
      Object.assign(last, { payment_status: "UNPAID", payment_method: null, payment_ref: null, payment_confirmed_at: null });
      Object.assign(prev, {
        payment_status: "PENDING",
        payment_method: "UPI",
        payment_ref: utr(),
        payment_reported_at: new Date(now - 3 * 3_600_000).toISOString(),
        payment_confirmed_at: null,
      });
    }

    // ---- live pickups happening right now ----
    if (i === 1 || i === 2 || i === 4) {
      const status = i === 1 ? "ACCEPTED" : "PENDING";
      const placed = new Date(now - (i === 4 ? 24 : i * 7) * 60_000);
      orders.push({
        id: `${deviceId}#${n}`,
        device_order_id: n++,
        device_id: deviceId,
        tenant_id: tenant.id,
        customer_id: userId,
        customer_telegram_id: telegramId,
        driver_id: status === "ACCEPTED" ? DRIVERS[0].chat : null,
        address: c.address,
        weight_kg: c.target + 0.3,
        status,
        amount_due: Math.round((c.target + 0.3) * price),
        placed_at: placed.toISOString(),
        accepted_at: status === "ACCEPTED" ? new Date(placed.getTime() + 9 * 60_000).toISOString() : null,
        payment_status: "UNPAID",
      });
    }
  }

  for (let k = 0; k < orders.length; k += 200) {
    const { error } = await admin.from("orders").upsert(orders.slice(k, k + 200), { onConflict: "id" });
    if (error) throw error;
  }
  const count = (s: string) => orders.filter((o) => o.payment_status === s).length;
  console.log(
    `Seeded ${tenant.name}: ${CUSTOMERS.length} customers, ${CUSTOMERS.length} baskets, ${DRIVERS.length} drivers, ${orders.length} orders ` +
      `(${count("PAID")} paid, ${count("UNPAID")} unpaid, ${count("PENDING")} awaiting confirmation).`,
  );
  console.log(`Demo customer login: ${emailFor(CUSTOMERS[0].name)} / ${DEMO_PASSWORD}`);
}

async function main() {
  const [code, flag] = process.argv.slice(2);
  if (!code) throw new Error("Usage: demo-data.ts <Business ID> [--remove]");
  const tenant = await findTenant(code.toUpperCase());
  await remove(tenant.id); // always start clean so re-running doesn't duplicate
  if (flag !== "--remove") await add(tenant);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
