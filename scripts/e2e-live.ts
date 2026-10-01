/**
 * Live end-to-end check of the deployed site and database: auth, roles, business isolation (RLS),
 * Business ID joining, ingest routing, UPI payment reporting/confirmation and subscriptions.
 * Creates throwaway users, two businesses and fake Telegram IDs, then deletes everything it made.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=… TOSS_BRIDGE_KEY=… npx tsx scripts/e2e-live.ts
 *
 * The real Telegram approval screen can't be automated, so linking is exercised through the same
 * server-side link_telegram() the callback calls after verifying Telegram's signed ID token.
 */
import { randomBytes } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SITE = process.env.TOSS_SITE ?? "https://toss-code-x-a24a.vercel.app";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://xysopyyujfgwpwfrhmei.supabase.co";
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_y8cOXBSAyWGE30HnmLRgKw_Rma309zC";
const SECRET = must("SUPABASE_SERVICE_ROLE_KEY");
const BRIDGE = must("TOSS_BRIDGE_KEY");

const TG_CUSTOMER = "9999999997";
const TG_STRANGER = "9999999996";
const RUN = Date.now();
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

const admin = createClient(SB_URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const userIds: string[] = [];
const tenantIds: string[] = [];

async function makeUser(tag: string, name: string) {
  const email = `e2e-${tag}-${RUN}@toss-test.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  userIds.push(data.user.id);
  return { id: data.user.id, email };
}

// A signed-in Supabase client (fresh JWT, so it carries the latest app_metadata).
async function clientFor(email: string): Promise<SupabaseClient> {
  const c = createClient(SB_URL, PUB, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return c;
}

// Cookies exactly as the site's @supabase/ssr expects them.
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

async function get(path: string, cookie?: string) {
  const res = await fetch(SITE + path, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  return { status: res.status, location: res.headers.get("location") ?? "", body: res.status === 200 ? await res.text() : "" };
}

async function ingest(telegramId: string, orderId: number, status = "PENDING") {
  const res = await fetch(`${SITE}/api/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-device-key": BRIDGE },
    body: JSON.stringify({ orderId, customerId: telegramId, address: "E2E test basket", weight: 5, status }),
  });
  return res.status;
}

async function register(userId: string, name: string, price: number) {
  const { data, error } = await admin.rpc("register_business", {
    p_user: userId,
    p_name: name,
    p_upi_id: "e2e.shop@okaxis",
    p_upi_name: name,
    p_price: price,
  });
  if (error) throw error;
  const r = data as { tenant_id: string; join_code: string };
  tenantIds.push(r.tenant_id);
  return r;
}

async function main() {
  try {
    // ---------- people ----------
    const owner = await makeUser("owner", "Olive Owner");
    await admin.auth.admin.updateUserById(owner.id, { app_metadata: { role: "owner" } });
    const mgrA = await makeUser("mgra", "Asha Manager");
    const mgrB = await makeUser("mgrb", "Bala Manager");
    const cust = await makeUser("cust", "Eve Customer");

    const custRow = await admin.from("customers").select("customer_code, tenant_id").eq("id", cust.id).single();
    check("signup: customer gets a Customer ID and no business", /^C-[A-Z0-9]{6}$/.test(custRow.data?.customer_code ?? "") && custRow.data?.tenant_id === null, custRow.data?.customer_code);

    // ---------- businesses ----------
    const a = await register(mgrA.id, "E2E Laundry A", 100);
    const b = await register(mgrB.id, "E2E Laundry B", 50);
    check("register: business gets a Business ID", /^B-[A-Z0-9]{6}$/.test(a.join_code), a.join_code);
    const tA = await admin.from("tenants").select("plan_status, trial_ends_at, manager_id").eq("id", a.tenant_id).single();
    check("register: starts on a free trial", tA.data?.plan_status === "TRIAL" && !!tA.data?.trial_ends_at && tA.data?.manager_id === mgrA.id);

    // ---------- route guards per role ----------
    check("signed out: /owner redirects to /login", (await get("/owner")).location.endsWith("/login"));
    const ownerCookie = await cookiesFor(owner.email);
    const mgrACookie = await cookiesFor(mgrA.email);
    const custCookie = await cookiesFor(cust.email);
    check("customer: /owner redirects to /app", (await get("/owner", custCookie)).location.endsWith("/app"));
    check("manager: /owner redirects to /admin", (await get("/owner", mgrACookie)).location.endsWith("/admin"));
    check("owner: /admin redirects to /owner", (await get("/admin", ownerCookie)).location.endsWith("/owner"));

    // ---------- customer joins business A ----------
    const custDb = await clientFor(cust.email);
    const bad = await custDb.rpc("join_tenant", { p_code: "B-ZZZZZZ" });
    check("join: unknown Business ID rejected", !!bad.error?.message.includes("unknown_business_id"));
    const join = await custDb.rpc("join_tenant", { p_code: a.join_code.toLowerCase() });
    check("join: customer joins with Business ID (any case)", !join.error, join.error?.message);
    const mgrADb = await clientFor(mgrA.email);
    const mgrBDb = await clientFor(mgrB.email);
    const joinAsMgr = await mgrBDb.rpc("join_tenant", { p_code: a.join_code });
    check("join: managers cannot join as customers", !!joinAsMgr.error);

    // ---------- ingest routes orders to the customer's business ----------
    const link = await admin.rpc("link_telegram", { p_customer: cust.id, p_telegram_id: TG_CUSTOMER });
    check("telegram: link_telegram links the account", !link.error, link.error?.message);
    check("ingest: customer's basket order accepted", (await ingest(TG_CUSTOMER, 700, "COMPLETED")) === 200);
    check("ingest: unknown basket order accepted", (await ingest(TG_STRANGER, 700)) === 200);
    const order = await admin.from("orders").select("tenant_id, amount_due, customer_id").eq("id", `legacy-${TG_CUSTOMER}#700`).single();
    check("ingest: order filed under business A at A's price", order.data?.tenant_id === a.tenant_id && order.data?.amount_due === 500, JSON.stringify(order.data));
    const stray = await admin.from("orders").select("tenant_id").eq("id", `legacy-${TG_STRANGER}#700`).single();
    check("ingest: unknown basket's order has no business yet", stray.data?.tenant_id === null);

    // ---------- isolation between businesses ----------
    const seenByA = await mgrADb.from("orders").select("id");
    const seenByB = await mgrBDb.from("orders").select("id");
    check("rls: manager A sees only A's orders", seenByA.data?.length === 1 && seenByA.data[0].id === `legacy-${TG_CUSTOMER}#700`, JSON.stringify(seenByA.data));
    check("rls: manager B sees none of A's orders", seenByB.data?.length === 0, JSON.stringify(seenByB.data));
    const custsB = await mgrBDb.from("customers").select("id");
    check("rls: manager B can't see A's customers", custsB.data?.length === 0);
    const planHack = await mgrADb.from("tenants").update({ plan_status: "ACTIVE", paid_until: "2099-01-01" }).eq("id", a.tenant_id).select("id");
    check("rls: manager can't extend their own plan", !!planHack.error);
    const crossEdit = await mgrBDb.from("orders").update({ amount_due: 1 }).eq("id", `legacy-${TG_CUSTOMER}#700`).select("id");
    check("rls: manager B can't edit A's invoice", (crossEdit.data?.length ?? 0) === 0);

    // ---------- UPI payment: report → confirm ----------
    const custWrite = await custDb.from("orders").update({ payment_status: "PAID" }).eq("id", `legacy-${TG_CUSTOMER}#700`).select("id");
    check("pay: customer can't mark own order paid directly", (custWrite.data?.length ?? 0) === 0);
    const badRef = await custDb.rpc("report_payment", { p_order: `legacy-${TG_CUSTOMER}#700`, p_ref: "##" });
    check("pay: malformed UPI reference rejected", !!badRef.error?.message.includes("invalid_reference"));
    const report = await custDb.rpc("report_payment", { p_order: `legacy-${TG_CUSTOMER}#700`, p_ref: "4123 5678 9012" });
    check("pay: customer reports UPI payment", !report.error, report.error?.message);
    const again = await custDb.rpc("report_payment", { p_order: `legacy-${TG_CUSTOMER}#700`, p_ref: "412356789012" });
    check("pay: can't report the same invoice twice", !!again.error);

    const home = await get("/app", custCookie);
    check("customer: /app shows their laundry and pending payment", home.body.includes("E2E Laundry A") && home.body.includes("Awaiting confirmation"));
    const payPage = await get("/admin/payments", mgrACookie);
    check("manager: /admin/payments lists the reported UPI ref", payPage.status === 200 && payPage.body.includes("412356789012"));

    const confirm = await mgrADb.from("orders").update({ payment_status: "PAID", payment_confirmed_at: new Date().toISOString() }).eq("id", `legacy-${TG_CUSTOMER}#700`).select("id");
    check("pay: manager A confirms the payment", confirm.data?.length === 1, confirm.error?.message);
    const amountEdit = await mgrADb.from("orders").update({ amount_due: 450 }).eq("id", `legacy-${TG_CUSTOMER}#700`).select("amount_due");
    check("pay: manager can adjust an invoice amount", amountEdit.data?.[0]?.amount_due === 450);
    const reIngest = await ingest(TG_CUSTOMER, 700, "COMPLETED");
    const after = await admin.from("orders").select("payment_status").eq("id", `legacy-${TG_CUSTOMER}#700`).single();
    check("pay: device retry never un-pays a confirmed invoice", reIngest === 200 && after.data?.payment_status === "PAID");

    // ---------- subscription: manager pays → owner approves ----------
    const sub = await mgrADb.rpc("submit_subscription_payment", { p_months: 3, p_ref: "SUBREF123456" });
    check("subscription: manager submits payment", !sub.error, sub.error?.message);
    const custSub = await custDb.rpc("submit_subscription_payment", { p_months: 1, p_ref: "SUBREF654321" });
    check("subscription: customers can't submit one", !!custSub.error);
    const subRow = await admin.from("subscription_payments").select("id, amount").eq("tenant_id", a.tenant_id).single();
    const settings = await admin.from("platform_settings").select("monthly_price").eq("id", 1).single();
    check("subscription: amount = 3 × plan price", subRow.data?.amount === 3 * (settings.data?.monthly_price ?? -1));
    const ownerBoard = await get("/owner", ownerCookie);
    check("owner: /owner lists both businesses", ownerBoard.status === 200 && ownerBoard.body.includes("E2E Laundry A") && ownerBoard.body.includes("E2E Laundry B"));
    const ownerPays = await get("/owner/payments", ownerCookie);
    check("owner: /owner/payments shows the pending payment", ownerPays.body.includes("SUBREF123456"));
    const approve = await admin.rpc("review_subscription_payment", { p_id: subRow.data!.id, p_approve: true });
    const tAfter = await admin.from("tenants").select("plan_status, paid_until, trial_ends_at").eq("id", a.tenant_id).single();
    const extendedFromTrial = new Date(tAfter.data!.paid_until).getTime() > new Date(tAfter.data!.trial_ends_at).getTime() + 80 * 86_400_000;
    check("subscription: approval activates and adds 3 months after the trial", !approve.error && tAfter.data?.plan_status === "ACTIVE" && extendedFromTrial);

    // ---------- suspension and expiry lock the manager out ----------
    await admin.from("tenants").update({ plan_status: "SUSPENDED" }).eq("id", b.tenant_id);
    const mgrBCookie = await cookiesFor(mgrB.email);
    const locked = await get("/admin", mgrBCookie);
    check("plan: suspended business sees a lock screen", locked.status === 200 && locked.body.includes("Business suspended"));
    const billing = await get("/admin/billing", mgrBCookie);
    check("plan: billing page still reachable", billing.status === 200);
    const joinSuspended = await custDb.rpc("join_tenant", { p_code: b.join_code });
    check("plan: customers can't join a suspended business", !!joinSuspended.error?.message.includes("business_suspended"));
  } finally {
    await admin.from("orders").delete().in("device_id", [`legacy-${TG_CUSTOMER}`, `legacy-${TG_STRANGER}`]);
    await admin.from("devices").delete().in("device_id", [`legacy-${TG_CUSTOMER}`, `legacy-${TG_STRANGER}`]);
    if (tenantIds.length) {
      await admin.from("customers").update({ tenant_id: null }).in("tenant_id", tenantIds);
      await admin.from("tenants").delete().in("id", tenantIds);
    }
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
