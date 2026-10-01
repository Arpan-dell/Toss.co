/**
 * Places one demo pickup through the live ingest endpoint, exactly like a basket would, so you can
 * watch auto-dispatch pick a driver and message them in Toss Handy. Uses a demo basket: gives it a
 * one-time device key, posts the order, then removes the key again.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/demo-order.ts [deviceId] [weightKg]
 */
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SITE = process.env.TOSS_SITE ?? "https://toss-code-x-a24a.vercel.app";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://xysopyyujfgwpwfrhmei.supabase.co";
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SECRET) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(SB_URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  const deviceId = process.argv[2] ?? "demo-basket-02";
  const weight = Number(process.argv[3] ?? 4.6);
  const { data: dev } = await admin.from("devices").select("device_id, address, customer_id").eq("device_id", deviceId).single();
  const { data: cust } = await admin.from("customers").select("telegram_id").eq("id", dev!.customer_id).single();
  const { data: last } = await admin.from("orders").select("device_order_id").eq("device_id", deviceId).order("device_order_id", { ascending: false }).limit(1).maybeSingle();
  const orderId = (last?.device_order_id ?? 100) + 1;

  const key = randomBytes(24).toString("base64url");
  await admin.from("devices").update({ api_key_hash: createHash("sha256").update(key).digest("hex") }).eq("device_id", deviceId);
  try {
    const res = await fetch(`${SITE}/api/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-key": key },
      body: JSON.stringify({ type: "order", deviceId, orderId, customerTelegramId: cust?.telegram_id, address: dev!.address, weight, status: "PENDING" }),
    });
    console.log(res.status, JSON.stringify(await res.json(), null, 2));
  } finally {
    await admin.from("devices").update({ api_key_hash: null }).eq("device_id", deviceId);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
