/**
 * Live check of invoices on the deployed site. A throwaway manager presses "✓ Received" on a
 * customer's reported UPI payment (the real form on the order page); the order must get an invoice
 * number and the customer an invoice email with the PDF. Then checks who can download the PDF.
 * Manager and customer are +aliases of the Toss Gmail, so their emails land in that inbox.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=… GMAIL_USER=toss.smartlaundry@gmail.com npx tsx scripts/e2e-invoice.ts [save.pdf]
 */
import { writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const SITE = process.env.TOSS_SITE ?? "https://toss-code-x-a24a.vercel.app";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://xysopyyujfgwpwfrhmei.supabase.co";
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_y8cOXBSAyWGE30HnmLRgKw_Rma309zC";
const SECRET = must("SUPABASE_SERVICE_ROLE_KEY");
const GMAIL = must("GMAIL_USER");

const RUN = Date.now();
const PASSWORD = randomBytes(12).toString("base64url");
const DEVICE = `e2e-inv-${RUN}`;
const ORDER = `${DEVICE}#104`;
const DRIVER_CHAT = "7399999901";

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
const alias = (tag: string) => GMAIL.replace("@", `+${tag}${RUN}@`);

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

const download = (cookie?: string) =>
  fetch(`${SITE}/invoice/${encodeURIComponent(ORDER)}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });

async function main() {
  const users: string[] = [];
  let tenantId = "";
  try {
    const mk = async (tag: string, meta: Record<string, string> = {}) => {
      const email = alias(tag);
      const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: meta });
      if (error) throw error;
      users.push(data.user.id);
      return { id: data.user.id, email };
    };
    const mgr = await mk("invmgr");
    const cust = await mk("invcust", { full_name: "Riya Test", phone: `+9195${String(RUN).slice(-8)}` });
    const stranger = await mk("invother", { full_name: "Someone Else" });
    const reg = await admin.rpc("register_business", { p_user: mgr.id, p_name: "Invoice Test Laundry", p_upi_id: "inv@okaxis", p_upi_name: "IT", p_price: 100 });
    if (reg.error) throw reg.error;
    tenantId = (reg.data as { tenant_id: string }).tenant_id;
    await admin.from("tenants").update({ store_address: "Shop 4, Lajpat Nagar Market, New Delhi" }).eq("id", tenantId);
    await admin.from("customers").update({ tenant_id: tenantId }).eq("id", cust.id);
    await admin.from("devices").insert({ device_id: DEVICE, tenant_id: tenantId, customer_id: cust.id, area: "Saket - Riya" });
    await admin.from("drivers").insert({ tenant_id: tenantId, name: "Vikram Test", telegram_chat_id: DRIVER_CHAT, status: "AVAILABLE" });
    const t0 = Date.now() - 3 * 3600_000;
    await admin.from("orders").insert({
      id: ORDER, device_order_id: 104, device_id: DEVICE, tenant_id: tenantId, customer_id: cust.id, driver_id: DRIVER_CHAT,
      address: "B-12, Saket, New Delhi 110017", weight_kg: 4.2, status: "COMPLETED", amount_due: 336, amount_before_discount: 420, discount_pct: 20,
      placed_at: new Date(t0).toISOString(), accepted_at: new Date(t0 + 600_000).toISOString(), completed_at: new Date(t0 + 3600_000).toISOString(),
      payment_status: "PENDING", payment_method: "UPI", payment_ref: "412345678901", payment_reported_at: new Date().toISOString(),
    });

    const mgrCookie = await cookiesFor(mgr.email);
    const custCookie = await cookiesFor(cust.email);
    check("no invoice before payment is confirmed", (await download(custCookie)).status === 409);

    // ---- the manager presses "✓ Received" (the real form on the order page) ----
    const page = await fetch(`${SITE}/admin/orders/${encodeURIComponent(ORDER)}`, { headers: { cookie: mgrCookie } }).then((r) => r.text());
    const form = page.split("<form").find((f) => f.includes("✓ Received"));
    const actionField = form?.match(/name="(\$ACTION_ID_[0-9a-f]+)"/)?.[1];
    check("order page has the Received button", !!actionField);
    const body = new FormData();
    body.set(actionField!, "");
    body.set("orderId", ORDER);
    const res = await fetch(`${SITE}/admin/orders/${encodeURIComponent(ORDER)}`, { method: "POST", headers: { cookie: mgrCookie }, body, redirect: "manual" });
    check("Received button accepted", res.status < 400, String(res.status));

    const { data: o } = await admin.from("orders").select("payment_status, invoice_number, invoice_sent_at").eq("id", ORDER).single();
    check("payment confirmed and invoice issued", o?.payment_status === "PAID" && /^TOSS-\d{4}-\d{6}$/.test(o?.invoice_number ?? ""), JSON.stringify(o));
    check("invoice sent to the customer", !!o?.invoice_sent_at);

    // ---- downloads ----
    const mine = await download(custCookie);
    const pdf = new Uint8Array(await mine.arrayBuffer());
    check(
      "customer downloads their invoice PDF",
      mine.status === 200 && mine.headers.get("content-type") === "application/pdf" && Buffer.from(pdf.slice(0, 5)).toString() === "%PDF-",
      `${mine.status} ${mine.headers.get("content-disposition")}`,
    );
    if (process.argv[2]) writeFileSync(process.argv[2], pdf);
    check("manager downloads it too", (await download(mgrCookie)).status === 200);
    check("another customer can't", (await download(await cookiesFor(stranger.email))).status === 404);
    const anon = await download();
    check("signed out: sent to login", anon.status === 303 && (anon.headers.get("location") ?? "").includes("/login"));
    const list = await fetch(`${SITE}/app/orders`, { headers: { cookie: custCookie } }).then((r) => r.text());
    check("order history links the invoice", list.includes(`/invoice/${encodeURIComponent(ORDER)}`));

    console.log(`\nCheck ${GMAIL} for "Your invoice from Invoice Test Laundry · ₹336 paid" with ${o?.invoice_number}.pdf attached.`);
  } finally {
    if (tenantId) {
      await admin.from("orders").delete().eq("device_id", DEVICE);
      await admin.from("devices").delete().eq("device_id", DEVICE);
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
