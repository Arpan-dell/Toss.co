/**
 * Live check of adding drivers by name + mobile number and connecting them through the driver bot.
 * Simulates the Telegram updates the driver bot would receive (shared contact, /start, Online),
 * then deletes the throwaway business, users and drivers it made.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=… TELEGRAM_DRIVER_WEBHOOK_SECRET=… npx tsx scripts/e2e-driver-phone.ts
 */
import { randomBytes } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const SITE = process.env.TOSS_SITE ?? "https://toss-code-x-a24a.vercel.app";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://xysopyyujfgwpwfrhmei.supabase.co";
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_y8cOXBSAyWGE30HnmLRgKw_Rma309zC";
const SECRET = must("SUPABASE_SERVICE_ROLE_KEY");
const HOOK_SECRET = must("TELEGRAM_DRIVER_WEBHOOK_SECRET");

const RUN = Date.now();
const PASSWORD = randomBytes(12).toString("base64url");
const DRIVER_PHONE = `+9197${String(RUN).slice(-8)}`; // fake, unique per run
const DRIVER_CHAT = "7299999901";
const OTHER_CHAT = "7299999902";

function must(k: string) {
  const v = process.env[k];
  if (!v) throw new Error(`Set ${k}`);
  return v;
}

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

const admin = createClient(SB_URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });

let updateId = 1;
async function telegram(update: Record<string, unknown>) {
  const res = await fetch(`${SITE}/api/telegram/driver-webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": HOOK_SECRET },
    body: JSON.stringify({ update_id: updateId++, ...update }),
  });
  return res.status;
}
const msg = (chat: string, extra: Record<string, unknown>) =>
  telegram({ message: { message_id: updateId, chat: { id: Number(chat), type: "private" }, from: { id: Number(chat) }, ...extra } });
const shareContact = (chat: string, phone: string, userId = chat) => msg(chat, { contact: { phone_number: phone, user_id: Number(userId) } });

const driverRow = async () =>
  (await admin.from("drivers").select("telegram_chat_id, status").eq("phone", DRIVER_PHONE).maybeSingle()).data as {
    telegram_chat_id: string | null;
    status: string;
  } | null;

async function cookiesFor(email: string): Promise<string> {
  const jar = new Map<string, string>();
  const ssr = createServerClient(SB_URL, PUB, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cs) => cs.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await ssr.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
}

async function main() {
  let userId = "";
  let tenantId = "";
  try {
    await admin.from("drivers").delete().in("telegram_chat_id", [DRIVER_CHAT, OTHER_CHAT]); // leftovers from a crashed run

    // ---- a manager with a business ----
    const email = `drvph-mgr-${RUN}@toss-test.invalid`;
    const { data: u, error: ue } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (ue) throw ue;
    userId = u.user.id;
    const reg = await admin.rpc("register_business", { p_user: userId, p_name: "Driver Phone Test", p_upi_id: "dp@okaxis", p_upi_name: "DP", p_price: 50 });
    if (reg.error) throw reg.error;
    tenantId = (reg.data as { tenant_id: string }).tenant_id;

    // ---- manager adds a driver by name + phone (same insert the Fleet form makes, under RLS) ----
    const mgr = createClient(SB_URL, PUB, { auth: { persistSession: false } });
    await mgr.auth.signInWithPassword({ email, password: PASSWORD });
    const add = await mgr.from("drivers").insert({ tenant_id: tenantId, name: "Vikram", phone: DRIVER_PHONE, status: "OFFLINE" });
    check("manager adds a driver with just name + phone", !add.error, add.error?.message);
    const dup = await mgr.from("drivers").insert({ tenant_id: tenantId, name: "Copy", phone: DRIVER_PHONE, status: "OFFLINE" });
    check("the same number can't be added twice", dup.error?.code === "23505", dup.error?.code);
    const seen = await mgr.from("drivers").select("name, phone").eq("phone", DRIVER_PHONE).maybeSingle();
    check("manager can read the driver's phone", seen.data?.phone === DRIVER_PHONE, JSON.stringify(seen.data ?? seen.error));

    const cookie = await cookiesFor(email);
    const fleet = await fetch(`${SITE}/admin/fleet`, { headers: { cookie } }).then((r) => r.text());
    check(
      "fleet page shows the number and 'not connected'",
      fleet.includes(`+91 ${DRIVER_PHONE.slice(3, 8)} ${DRIVER_PHONE.slice(8)}`) && fleet.includes("Not connected to Telegram yet"),
    );
    check("fleet page shows the driver-bot QR code", fleet.includes("Scan to open Toss Handy") && fleet.includes("<svg") && fleet.includes("toss-handy-qr.svg"));

    // ---- driver bot ----
    check("bot: /start from an unknown chat is answered", (await msg(DRIVER_CHAT, { text: "/start" })) === 200);

    await shareContact(DRIVER_CHAT, DRIVER_PHONE.slice(1), OTHER_CHAT); // forwarding someone else's contact
    check("bot: someone else's contact doesn't connect", (await driverRow())?.telegram_chat_id === null);

    await shareContact(DRIVER_CHAT, "+919000000000");
    check("bot: an unknown number doesn't connect", (await driverRow())?.telegram_chat_id === null);

    await shareContact(DRIVER_CHAT, DRIVER_PHONE.slice(1)); // Telegram often omits the "+"
    check("bot: sharing their own number connects the driver", (await driverRow())?.telegram_chat_id === DRIVER_CHAT, JSON.stringify(await driverRow()));

    await shareContact(OTHER_CHAT, DRIVER_PHONE);
    check("bot: a second Telegram account can't take over the driver", (await driverRow())?.telegram_chat_id === DRIVER_CHAT);

    await msg(DRIVER_CHAT, { text: "🟢 Online" });
    check("bot: connected driver can go online", (await driverRow())?.status === "AVAILABLE", (await driverRow())?.status);
  } finally {
    if (tenantId) {
      await admin.from("drivers").delete().eq("tenant_id", tenantId);
      await admin.from("tenants").delete().eq("id", tenantId);
    }
    if (userId) await admin.auth.admin.deleteUser(userId);
    console.log("cleaned up test data");
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
