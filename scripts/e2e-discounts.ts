/**
 * Live check of win-back discounts, multi-month subscription discounts and customer phone privacy.
 * Builds a throwaway business, customer, basket and orders, then deletes everything it made.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/e2e-discounts.ts
 *
 * The daily job's SQL (create_winback_offers) runs across all businesses, so any offers it creates
 * for other customers during this test are removed again; tomorrow's real run creates and announces them.
 */
import { randomBytes } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const SITE = process.env.TOSS_SITE ?? "https://toss-code-x-a24a.vercel.app";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://xysopyyujfgwpwfrhmei.supabase.co";
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_y8cOXBSAyWGE30HnmLRgKw_Rma309zC";
const SECRET = must("SUPABASE_SERVICE_ROLE_KEY");

const RUN = Date.now();
const PASSWORD = randomBytes(12).toString("base64url");
const DEVICE = `e2e-disc-${RUN}`;
const PHONE = `+9196${String(RUN).slice(-8)}`;

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
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

async function signedIn(email: string) {
  const c = createClient(SB_URL, PUB, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return c;
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

async function main() {
  const users: string[] = [];
  let tenantId = "";
  try {
    const mk = async (tag: string, meta: Record<string, string> = {}) => {
      const email = `disc-${tag}-${RUN}@toss-test.invalid`;
      const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: meta });
      if (error) throw error;
      users.push(data.user.id);
      return { id: data.user.id, email };
    };
    const mgr = await mk("mgr");
    const cust = await mk("cust", { full_name: "Quiet Customer", phone: PHONE });
    const reg = await admin.rpc("register_business", { p_user: mgr.id, p_name: "Discount Test", p_upi_id: "dt@okaxis", p_upi_name: "DT", p_price: 100 });
    if (reg.error) throw reg.error;
    tenantId = (reg.data as { tenant_id: string }).tenant_id;
    await admin.from("customers").update({ tenant_id: tenantId }).eq("id", cust.id);
    await admin.from("devices").insert({ device_id: DEVICE, tenant_id: tenantId, customer_id: cust.id });

    // ---------- manager sets the win-back offer (as the manager, under column grants) ----------
    const mgrDb = await signedIn(mgr.email);
    const set = await mgrDb.from("tenants").update({ winback_enabled: true, winback_days: 10, winback_pct: 20 }).eq("id", tenantId).select("id");
    check("manager can set win-back days and %", !set.error && set.data?.length === 1, set.error?.message);

    // ---------- phone privacy ----------
    const leak = await mgrDb.from("customers").select("phone").eq("id", cust.id);
    check("manager can't read a customer's phone", !!leak.error, leak.error?.code ?? JSON.stringify(leak.data));
    const names = await mgrDb.from("customers").select("name").eq("id", cust.id).maybeSingle();
    check("manager still sees the customer's name", names.data?.name === "Quiet Customer");
    const custDb = await signedIn(cust.email);
    const own = await custDb.rpc("my_phone");
    check("customer reads their own phone", own.data === PHONE, JSON.stringify(own));
    const custCookie = await cookiesFor(cust.email);
    const settings = await fetch(`${SITE}/app/settings`, { headers: { cookie: custCookie } }).then((r) => r.text());
    check("customer settings page still shows their number", settings.includes(`+91 ${PHONE.slice(3, 8)} ${PHONE.slice(8)}`));
    const mgrCookie = await cookiesFor(mgr.email);
    const custPage = await fetch(`${SITE}/admin/customers`, { headers: { cookie: mgrCookie } }).then((r) => r.text());
    check("manager customers page shows no phone", custPage.includes("Quiet Customer") && !custPage.includes(PHONE.slice(3, 8)));

    // ---------- win-back ----------
    await admin.from("orders").insert({
      id: `${DEVICE}#100`, device_order_id: 100, device_id: DEVICE, tenant_id: tenantId, customer_id: cust.id,
      weight_kg: 5, status: "COMPLETED", amount_due: 500, placed_at: daysAgo(20),
    });
    const { data: maxRow } = await admin.from("customer_offers").select("id").order("id", { ascending: false }).limit(1).maybeSingle();
    const before = (maxRow?.id as number) ?? 0;

    const run1 = await admin.rpc("create_winback_offers");
    const mine = ((run1.data ?? []) as { offer_id: number; business: string; percent: number }[]).filter((o) => o.business === "Discount Test");
    // Undo offers this test created for anyone else; the real daily run will create and announce them.
    await admin.from("customer_offers").delete().gt("id", before).neq("tenant_id", tenantId);
    check("quiet customer (20 days > 10) gets a win-back offer", !run1.error && mine.length === 1 && mine[0].percent === 20, JSON.stringify(run1.error ?? mine));

    const run2 = await admin.rpc("create_winback_offers");
    await admin.from("customer_offers").delete().gt("id", before).neq("tenant_id", tenantId);
    check("only one offer per quiet spell", ((run2.data ?? []) as { business: string }[]).filter((o) => o.business === "Discount Test").length === 0);

    const stats = await mgrDb.from("customer_offers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
    check("manager sees their business's offers", stats.count === 1);

    const dash = await fetch(`${SITE}/app`, { headers: { cookie: custCookie } }).then((r) => r.text());
    check("customer dashboard shows the offer", dash.includes("20% off your next pickup"));

    await admin.from("orders").insert({
      id: `${DEVICE}#101`, device_order_id: 101, device_id: DEVICE, tenant_id: tenantId, customer_id: cust.id,
      weight_kg: 4.2, status: "PENDING", amount_due: 420, placed_at: new Date().toISOString(),
    });
    const applied = await admin.rpc("apply_customer_offer", { p_order: `${DEVICE}#101` });
    const o101 = (await admin.from("orders").select("amount_due, discount_pct, amount_before_discount").eq("id", `${DEVICE}#101`).single()).data;
    check(
      "next pickup gets the discount (₹420 → ₹336)",
      o101?.amount_due === 336 && o101?.discount_pct === 20 && o101?.amount_before_discount === 420,
      JSON.stringify(applied.data ?? applied.error),
    );
    const again = await admin.rpc("apply_customer_offer", { p_order: `${DEVICE}#101` });
    check("discount isn't applied twice", again.data === null);
    const after = await fetch(`${SITE}/app`, { headers: { cookie: custCookie } }).then((r) => r.text());
    check("offer disappears once used", !after.includes("20% off your next pickup"));
    const direct = await custDb.rpc("apply_customer_offer", { p_order: `${DEVICE}#101` });
    check("customers can't call the offer functions", !!direct.error);

    // ---------- subscription discounts ----------
    const { data: ps } = await admin.from("platform_settings").select("monthly_price, discount_3m, discount_12m").eq("id", 1).single();
    const s1 = await mgrDb.rpc("submit_subscription_payment", { p_months: 3, p_ref: `E2E${RUN}A` });
    const p3 = (await admin.from("subscription_payments").select("amount, discount_pct").eq("payment_ref", `E2E${RUN}A`).single()).data;
    const want3 = Math.round((ps!.monthly_price * 3 * (100 - ps!.discount_3m)) / 100);
    check(`3 months: ${ps!.discount_3m}% off → ₹${want3}`, !s1.error && p3?.amount === want3 && p3?.discount_pct === ps!.discount_3m, JSON.stringify(s1.error ?? p3));
    await admin.from("subscription_payments").delete().eq("payment_ref", `E2E${RUN}A`);
    await mgrDb.rpc("submit_subscription_payment", { p_months: 12, p_ref: `E2E${RUN}B` });
    const p12 = (await admin.from("subscription_payments").select("amount, discount_pct").eq("payment_ref", `E2E${RUN}B`).single()).data;
    check(`12 months: ${ps!.discount_12m}% off`, p12?.amount === Math.round((ps!.monthly_price * 12 * (100 - ps!.discount_12m)) / 100));
    await admin.from("subscription_payments").delete().eq("payment_ref", `E2E${RUN}B`);
    await mgrDb.rpc("submit_subscription_payment", { p_months: 1, p_ref: `E2E${RUN}C` });
    const p1 = (await admin.from("subscription_payments").select("amount, discount_pct").eq("payment_ref", `E2E${RUN}C`).single()).data;
    check("1 month: full price", p1?.amount === ps!.monthly_price && p1?.discount_pct === 0);
    await admin.from("subscription_payments").delete().eq("payment_ref", `E2E${RUN}C`); // a pending payment hides the pay box
    const billing = await fetch(`${SITE}/admin/billing?months=12`, { headers: { cookie: mgrCookie } }).then((r) => r.text());
    check("billing page shows the 12-month discount", ps!.discount_12m === 0 || billing.includes(`${ps!.discount_12m}% off for paying 12 months`));
  } finally {
    if (tenantId) {
      await admin.from("subscription_payments").delete().eq("tenant_id", tenantId);
      await admin.from("customer_offers").delete().eq("tenant_id", tenantId);
      await admin.from("orders").delete().eq("device_id", DEVICE);
      await admin.from("devices").delete().eq("device_id", DEVICE);
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
