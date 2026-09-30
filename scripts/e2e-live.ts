/**
 * Live end-to-end check of auth, RLS, Telegram linking and the portals against the deployed site.
 * Creates a throwaway user and fake Telegram IDs, then deletes everything it created.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=… TOSS_BRIDGE_KEY=… npx tsx scripts/e2e-live.ts
 *
 * The real Telegram approval screen can't be automated, so linking is exercised through the same
 * server-side link_telegram() the callback calls after verifying Telegram's signed ID token.
 */
import { randomBytes } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const SITE = process.env.TOSS_SITE ?? "https://toss-code-x-a24a.vercel.app";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://xysopyyujfgwpwfrhmei.supabase.co";
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_y8cOXBSAyWGE30HnmLRgKw_Rma309zC";
const SECRET = must("SUPABASE_SERVICE_ROLE_KEY");
const BRIDGE = must("TOSS_BRIDGE_KEY");

const TG_MINE = "9999999997";
const TG_OTHER = "9999999996";
const EMAIL = `e2e-${Date.now()}@toss-test.invalid`;
const PASSWORD = randomBytes(12).toString("base64url");

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

const admin = createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });

// Sign in through @supabase/ssr so we get exactly the cookies the site expects.
async function signInCookies(): Promise<string> {
  const jar = new Map<string, string>();
  const ssr = createServerClient(URL, PUB, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cs) => cs.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await ssr.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw error;
  return [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
}

async function get(path: string, cookie?: string) {
  const res = await fetch(SITE + path, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  return { status: res.status, location: res.headers.get("location") ?? "", body: res.status === 200 ? await res.text() : "" };
}

async function ingest(telegramId: string, orderId: number) {
  const res = await fetch(`${SITE}/api/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-device-key": BRIDGE },
    body: JSON.stringify({ orderId, customerId: telegramId, address: "E2E test basket", weight: 5.5, status: "PENDING" }),
  });
  return res.status;
}

async function main() {
  let userId = "";
  try {
    // --- signup side effects ---
    const created = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Eve Tester" },
    });
    if (created.error) throw created.error;
    userId = created.data.user.id;
    const cust = await admin.from("customers").select("id, name, tenant_id").eq("id", userId).maybeSingle();
    check("signup trigger creates customers row", cust.data?.name === "Eve Tester" && cust.data?.tenant_id === "tenant-delhi-01");

    // --- route guards ---
    check("signed out: /app redirects to /login", (await get("/app")).location.endsWith("/login"));
    check("signed out: /admin redirects to /login", (await get("/admin")).location.endsWith("/login"));

    const cookie = await signInCookies();
    const home = await get("/app", cookie);
    check("customer: /app renders", home.status === 200 && home.body.includes("Eve"), `status ${home.status}`);
    check("customer: /admin redirects to /app", (await get("/admin", cookie)).location.endsWith("/app"));
    check("customer: /login redirects to /app", (await get("/login", cookie)).location.endsWith("/app"));

    // --- orders exist before the account is linked ---
    check("ingest: my basket's order", (await ingest(TG_MINE, 700)) === 200);
    check("ingest: someone else's order", (await ingest(TG_OTHER, 700)) === 200);

    // --- Telegram linking ---
    const start = await get("/api/telegram/start", cookie);
    if (start.location.includes("telegram=not-configured")) {
      console.log("SKIP  telegram: start/callback (TELEGRAM_CLIENT_ID/SECRET not set on the server yet)");
    } else {
      const auth = new globalThis.URL(start.location);
      check(
        "telegram: start redirects to Telegram with PKCE",
        auth.origin === "https://oauth.telegram.org" && auth.searchParams.get("code_challenge_method") === "S256" && !!auth.searchParams.get("state"),
        start.location,
      );
      const forged = await get("/api/telegram/callback?code=fake&state=forged", cookie);
      check("telegram: callback without matching state rejected", forged.location.includes("telegram=invalid"), forged.location);
      const cancelled = await get("/api/telegram/callback?error=access_denied", cookie);
      check("telegram: cancelled login reported", cancelled.location.includes("telegram=cancelled"), cancelled.location);
    }
    const link = await admin.rpc("link_telegram", { p_customer: userId, p_telegram_id: TG_MINE });
    check("telegram: link_telegram links the account", !link.error, link.error?.message);
    const linked = await admin.from("orders").select("customer_id").eq("id", `legacy-${TG_MINE}#700`).single();
    check("telegram: existing order attached to account", linked.data?.customer_id === userId);

    // --- RLS as the customer ---
    const user = createClient(URL, PUB, { auth: { persistSession: false } });
    await user.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    const mine = await user.from("orders").select("id");
    check("rls: customer sees only own orders", mine.data?.length === 1 && mine.data[0].id === `legacy-${TG_MINE}#700`, JSON.stringify(mine.data));
    const hash = await user.from("devices").select("api_key_hash");
    check("rls: device key hash not readable", !!hash.error);
    const rpc = await user.rpc("link_telegram", { p_customer: userId, p_telegram_id: TG_OTHER });
    check("rls: customer cannot call link_telegram", !!rpc.error);
    const write = await user.from("orders").update({ payment_status: "PAID" }).eq("id", `legacy-${TG_MINE}#700`).select("id");
    check("rls: customer cannot mark own order paid", (write.data?.length ?? 0) === 0);

    const page = await get("/app", cookie);
    check("customer: active pickup shown on /app", page.body.includes("Awaiting driver"));

    // --- manager ---
    await admin.auth.admin.updateUserById(userId, { app_metadata: { role: "manager" } });
    const mgrCookie = await signInCookies();
    const board = await get("/admin", mgrCookie);
    check("manager: /admin renders", board.status === 200 && board.body.includes("Live board"), `status ${board.status}`);
    check("manager: sees both baskets' orders", board.body.includes("E2E test basket"));
    check("manager: /app redirects to /admin", (await get("/app", mgrCookie)).location.endsWith("/admin"));
    const fleet = await get("/admin/fleet", mgrCookie);
    check("manager: /admin/fleet renders", fleet.status === 200);
    const analytics = await get("/admin/analytics", mgrCookie);
    check("manager: /admin/analytics renders", analytics.status === 200);
  } finally {
    await admin.from("orders").delete().in("device_id", [`legacy-${TG_MINE}`, `legacy-${TG_OTHER}`]);
    await admin.from("devices").delete().in("device_id", [`legacy-${TG_MINE}`, `legacy-${TG_OTHER}`]);
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
