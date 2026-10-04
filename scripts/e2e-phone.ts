/**
 * Live check of phone-number identity and Telegram Mini App auto-linking on the deployed site.
 * Creates throwaway customers with fake numbers and fake Telegram IDs, then deletes them.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=… TELEGRAM_CUSTOMER_BOT_TOKEN=… npx tsx scripts/e2e-phone.ts
 *
 * Mini App launch data is signed here with the customer bot token, exactly as Telegram signs it.
 */
import { createHmac, randomBytes } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { need } from "./env";

const SITE = process.env.TOSS_SITE ?? "https://tosslaundry.online";
const SB_URL = need("NEXT_PUBLIC_SUPABASE_URL");
const PUB = need("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const SECRET = must("SUPABASE_SERVICE_ROLE_KEY");
const BOT_TOKEN = must("TELEGRAM_CUSTOMER_BOT_TOKEN");

const RUN = Date.now();
const PASSWORD = randomBytes(12).toString("base64url");
const PHONE_A = `+9199${String(RUN).slice(-8)}`; // fake, unique per run
const TG_A = "9999999995";

function must(k: string) {
  const v = process.env[k];
  if (!v) throw new Error(`Set ${k}`);
  return v;
}

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

const admin = createClient(SB_URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const userIds: string[] = [];

// Returns undefined when Auth refuses the user (e.g. the sign-up trigger rejected a duplicate number).
async function tryMakeUser(tag: string, meta: Record<string, string>): Promise<{ id: string; email: string } | undefined> {
  const email = `e2e-${tag}-${RUN}@toss-test.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: meta });
  if (error) return undefined;
  userIds.push(data.user.id);
  return { id: data.user.id, email };
}

async function makeUser(tag: string, meta: Record<string, string>) {
  const u = await tryMakeUser(tag, meta);
  if (!u) throw new Error(`could not create ${tag}`);
  return u;
}

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

function initDataFor(telegramId: string, token = BOT_TOKEN) {
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "AAE2E",
    user: JSON.stringify({ id: Number(telegramId), first_name: "E2E" }),
  };
  const check = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  return new URLSearchParams({ ...fields, hash: createHmac("sha256", secret).update(check).digest("hex") }).toString();
}

async function miniapp(initData: string, cookie?: string) {
  const res = await fetch(`${SITE}/api/telegram/miniapp`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ initData }),
  });
  return { status: res.status, result: ((await res.json().catch(() => ({}))) as { result?: string }).result };
}

const row = async (id: string) =>
  (await admin.from("customers").select("phone, phone_verified, telegram_id").eq("id", id).single()).data as {
    phone: string | null;
    phone_verified: boolean;
    telegram_id: string | null;
  };

async function main() {
  try {
    await admin.from("customers").update({ telegram_id: null }).eq("telegram_id", TG_A); // leftovers from a crashed run

    // ---------- phone is stored at sign-up and is unique ----------
    const a = await makeUser("pa", { full_name: "Phone A", phone: PHONE_A });
    const ra = await row(a.id);
    check("signup: phone saved from sign-up metadata", ra.phone === PHONE_A && ra.phone_verified === false, JSON.stringify(ra));

    const dup = await tryMakeUser("pdup", { full_name: "Dup", phone: PHONE_A });
    check("signup: a second account can't take the same number", dup === undefined);

    const junk = await makeUser("pjunk", { full_name: "Junk", phone: "12345" });
    check("signup: malformed number is dropped, account still created", (await row(junk.id)).phone === null);

    const badFormat = await admin.from("customers").update({ phone: "98765" }).eq("id", a.id);
    check("db: non-E.164 numbers rejected", badFormat.error?.code === "23514");

    // Customers can't write their own row directly (no update policy): verification can't be faked.
    const self = createClient(SB_URL, PUB, { auth: { persistSession: false } });
    await self.auth.signInWithPassword({ email: a.email, password: PASSWORD });
    await self.from("customers").update({ phone_verified: true }).eq("id", a.id);
    check("db: customer can't mark their own number verified", (await row(a.id)).phone_verified === false);

    // ---------- Mini App auto-link ----------
    const cookieA = await cookiesFor(a.email);
    const anon = await miniapp(initDataFor(TG_A));
    check("miniapp: signed-out request refused", anon.status === 401, String(anon.status));

    const forged = await miniapp(initDataFor(TG_A, "123:not-the-bot"), cookieA);
    check("miniapp: launch data signed by another bot refused", forged.status === 400 && forged.result === "invalid", JSON.stringify(forged));

    const linked = await miniapp(initDataFor(TG_A), cookieA);
    check("miniapp: genuine launch data links Telegram", linked.result === "linked" && (await row(a.id)).telegram_id === TG_A, JSON.stringify(linked));

    const again = await miniapp(initDataFor(TG_A), cookieA);
    check("miniapp: reopening is a no-op", again.result === "already", JSON.stringify(again));

    const b = await makeUser("pb", { full_name: "Phone B", phone: `+9198${String(RUN).slice(-8)}` });
    const stolen = await miniapp(initDataFor(TG_A), await cookiesFor(b.email));
    check("miniapp: a Telegram account can't be linked to two customers", stolen.result === "taken" && (await row(b.id)).telegram_id === null, JSON.stringify(stolen));

    // ---------- pages ----------
    const settings = await fetch(`${SITE}/app/settings`, { headers: { cookie: cookieA } }).then((r) => r.text());
    check("settings: shows the customer's number", settings.includes(`+91 ${PHONE_A.slice(3, 8)} ${PHONE_A.slice(8)}`));
  } finally {
    await admin.from("customers").update({ telegram_id: null }).eq("telegram_id", TG_A);
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
    console.log("cleaned up test data");
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
