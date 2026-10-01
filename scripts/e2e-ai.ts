/**
 * Live check of Toss AI on the deployed site, with a throwaway business that has realistic history:
 * a weekly regular who went quiet, an unpaid invoice, a nearly-full basket and one connected driver.
 * Presses the real buttons on /admin/ai (Run analysis, Do it, Skip), switches the autopilot on,
 * checks another business can't act on these actions, then deletes everything.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/e2e-ai.ts
 *
 * Telegram chat IDs are fake (sends fail quietly) and customer emails are not real addresses, so the
 * test never runs a payment reminder (which emails).
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
const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();

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

const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Submits the server-rendered <form> containing `marker` exactly as a browser without JS would. */
async function submitForm(cookie: string, marker: string, extra: Record<string, string> = {}, nth = 0) {
  const html = await fetch(`${SITE}/admin/ai`, { headers: { cookie } }).then((r) => r.text());
  const forms = html.split("<form").slice(1).map((f) => f.split("</form>")[0]).filter((f) => f.includes(marker));
  const form = forms[nth];
  if (!form) return { status: 0, found: false };
  const body = new FormData();
  for (const m of form.matchAll(/<input([^>]*)>/g)) {
    const attrs = m[1];
    const name = attrs.match(/name="([^"]*)"/)?.[1];
    if (!name || !/type="hidden"/.test(attrs)) continue;
    body.set(unescape(name), unescape(attrs.match(/value="([^"]*)"/)?.[1] ?? ""));
  }
  for (const [k, v] of Object.entries(extra)) body.set(k, v);
  const res = await fetch(`${SITE}/admin/ai`, { method: "POST", headers: { cookie }, body, redirect: "manual" });
  return { status: res.status, found: true };
}

async function main() {
  const users: string[] = [];
  const tenants: string[] = [];
  try {
    const mk = async (tag: string, meta: Record<string, string> = {}) => {
      const email = `ai-${tag}-${RUN}@toss-test.invalid`;
      const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: meta });
      if (error) throw error;
      users.push(data.user.id);
      return { id: data.user.id, email };
    };
    const business = async (mgrId: string, name: string) => {
      const reg = await admin.rpc("register_business", { p_user: mgrId, p_name: name, p_upi_id: "ai@okaxis", p_upi_name: "AI", p_price: 100 });
      if (reg.error) throw reg.error;
      tenants.push((reg.data as { tenant_id: string }).tenant_id);
      return (reg.data as { tenant_id: string }).tenant_id;
    };

    const mgr = await mk("mgr");
    const other = await mk("other");
    const tenant = await business(mgr.id, "AI Test Laundry");
    await business(other.id, "Other Laundry");
    const [regular, payer, walkin] = await Promise.all([mk("regular", { full_name: "Regular" }), mk("payer", { full_name: "Payer" }), mk("walkin", { full_name: "Walkin" })]);
    const tg = { [regular.id]: "7499999901", [payer.id]: "7499999902", [walkin.id]: "7499999903" };
    for (const [id, chat] of Object.entries(tg)) await admin.from("customers").update({ tenant_id: tenant, telegram_id: chat }).eq("id", id);
    const { data: codes } = await admin.from("customers").select("id, customer_code").in("id", Object.keys(tg));
    const codeOf = new Map((codes ?? []).map((c) => [c.id, c.customer_code as string]));

    const dev = (n: number) => `e2e-ai-${RUN}-${n}`;
    await admin.from("devices").insert([
      { device_id: dev(1), tenant_id: tenant, customer_id: regular.id, target_kg: 5, last_weight_kg: 1 },
      { device_id: dev(2), tenant_id: tenant, customer_id: payer.id, target_kg: 5, last_weight_kg: 4.4 }, // 88% full
      { device_id: dev(3), tenant_id: tenant, customer_id: walkin.id, target_kg: 5, last_weight_kg: 0 },
    ]);
    await admin.from("drivers").insert({ tenant_id: tenant, name: "AI Driver", telegram_chat_id: "7499999990", status: "AVAILABLE", max_jobs: 3 });

    // History: the regular ordered weekly for 6 weeks and stopped 25 days ago; walk-in traffic daily;
    // the payer has one completed, unpaid pickup from 5 days ago.
    const orders: Record<string, unknown>[] = [];
    let n = 100;
    const add = (device: string, customer: string, daysAgo: number, extra: Record<string, unknown> = {}) =>
      orders.push({
        id: `${device}#${n}`, device_order_id: n++, device_id: device, tenant_id: tenant, customer_id: customer, weight_kg: 4,
        status: "COMPLETED", amount_due: 400, placed_at: ago(daysAgo), completed_at: ago(daysAgo - 0.1), payment_status: "PAID", ...extra,
      });
    for (const d of [25, 32, 39, 46, 53, 60]) add(dev(1), regular.id, d);
    for (let d = 1; d <= 50; d++) for (let k = 0; k < (d % 7 === 3 ? 12 : 2); k++) add(dev(3), walkin.id, d + k * 0.01);
    add(dev(2), payer.id, 5, { payment_status: "UNPAID", amount_due: 450 });
    for (let i = 0; i < orders.length; i += 200) {
      const { error } = await admin.from("orders").insert(orders.slice(i, i + 200));
      if (error) throw error;
    }

    const mgrCookie = await cookiesFor(mgr.email);
    const page0 = await fetch(`${SITE}/admin/ai`, { headers: { cookie: mgrCookie } }).then((r) => r.text());
    check("Toss AI page loads with the first-run call to action", page0.includes("Meet Toss AI") && page0.includes("Run my first analysis"));

    // ---- run the analysis with the real button ----
    const ran = await submitForm(mgrCookie, "Run my first analysis");
    check("Run analysis button works", ran.found && ran.status < 400, String(ran.status));
    const { data: runs } = await admin.from("ai_runs").select("id, source, report, error").eq("tenant_id", tenant);
    const report = runs?.[0]?.report as { headline?: string; health?: { score: number }; forecast?: unknown[]; kpis?: { outstanding: number } } | undefined;
    check("an analysis was saved with a briefing, health score and 7-day forecast", !!report?.headline && typeof report?.health?.score === "number" && report?.forecast?.length === 7, `${runs?.[0]?.source} ${runs?.[0]?.error ?? ""}`);
    check("outstanding money is counted", report?.kpis?.outstanding === 450);

    const { data: queued } = await admin.from("ai_actions").select("id, type, target, label, params, status").eq("tenant_id", tenant);
    const of = (t: string) => (queued ?? []).filter((a) => a.type === t);
    console.log("      action plan:", (queued ?? []).map((a) => a.label).join(" | "));
    check("win-back offer suggested for the quiet regular", of("winback_offer").some((a) => a.target === regular.id));
    check("payment reminder suggested for the unpaid pickup", of("payment_reminder").some((a) => (a.params as { orderId?: string }).orderId === `${dev(2)}#${n - 1}`));
    check("basket nudge suggested for the 88% full basket", of("basket_nudge").some((a) => a.target === dev(2)));
    check("nothing runs on its own while the autopilot is off", (queued ?? []).every((a) => a.status === "SUGGESTED"));

    const page1 = await fetch(`${SITE}/admin/ai`, { headers: { cookie: mgrCookie } }).then((r) => r.text());
    check("page shows the briefing and the action plan", page1.includes(report?.headline?.slice(0, 20) ?? "##") && page1.includes("Do it"));

    // ---- another business can't act on these ----
    const offer = of("winback_offer")[0];
    const otherCookie = await cookiesFor(other.email);
    const fakeBody = new FormData();
    const html = page1.split("<form").find((f) => f.includes(`value="${offer.id}"`) && f.includes("Do it"));
    const actionField = html?.match(/name="(\$ACTION_ID_[0-9a-f]+)"/)?.[1];
    if (actionField) {
      fakeBody.set(actionField, "");
      fakeBody.set("id", String(offer.id));
      await fetch(`${SITE}/admin/ai`, { method: "POST", headers: { cookie: otherCookie }, body: fakeBody, redirect: "manual" });
    }
    const { data: still } = await admin.from("ai_actions").select("status").eq("id", offer.id).single();
    check("another business's manager can't execute this action", !!actionField && still?.status === "SUGGESTED", still?.status);

    // ---- Do it: the win-back offer ----
    const doIt = await submitForm(mgrCookie, `value="${offer.id}"`, {}, 0);
    const { data: done } = await admin.from("ai_actions").select("status, result, auto").eq("id", offer.id).single();
    const { data: offers } = await admin.from("customer_offers").select("percent, reason").eq("customer_id", regular.id);
    check("Do it creates the win-back offer", doIt.found && done?.status === "EXECUTED" && done?.auto === false && offers?.length === 1 && offers[0].reason === "AI", `${done?.status}: ${done?.result}`);
    const pct = (offer.params as { pct: number }).pct;
    check("offer stays within the max-discount guardrail (20%)", offers?.[0]?.percent === pct && pct <= 20, String(pct));

    // ---- Skip: the basket nudge ----
    const nudge = of("basket_nudge")[0];
    await submitForm(mgrCookie, `value="${nudge.id}"`, {}, 1);
    const { data: skipped } = await admin.from("ai_actions").select("status").eq("id", nudge.id).single();
    check("Skip dismisses an action", skipped?.status === "DISMISSED", skipped?.status);

    // ---- autopilot on (staffing only), then a fresh analysis ----
    await admin.from("tenants").update({ autopilot_enabled: true, autopilot_staffing: true, autopilot_winback: false, autopilot_nudges: false, autopilot_pricing: false }).eq("id", tenant);
    await submitForm(mgrCookie, "Re-analyse now");
    const { data: after } = await admin.from("ai_actions").select("type, status, auto, result").eq("tenant_id", tenant).order("id", { ascending: false });
    const latest = after ?? [];
    const staffing = latest.filter((a) => (a.type === "driver_alert" || a.type === "set_max_jobs") && a.status !== "EXPIRED");
    check("autopilot executes staffing actions by itself", staffing.length > 0 && staffing.every((a) => a.auto && a.status !== "SUGGESTED"), JSON.stringify(staffing.map((a) => [a.type, a.status, a.result])));
    check("autopilot leaves switched-off categories as suggestions", latest.some((a) => a.type === "payment_reminder" && a.status === "SUGGESTED"));
    check("the regular isn't offered a second discount", !latest.some((a) => a.type === "winback_offer" && a.status === "SUGGESTED"));
    const page2 = await fetch(`${SITE}/admin/ai`, { headers: { cookie: mgrCookie } }).then((r) => r.text());
    check("activity log credits the autopilot", page2.includes("Autopilot on") && page2.includes(">Autopilot<"));

    // ---- Ask Toss AI ----
    console.log(`      latest briefing by: ${(await admin.from("ai_runs").select("source").eq("tenant_id", tenant).order("id", { ascending: false }).limit(1).single()).data?.source}`);
    console.log(`      regular customer code: ${codeOf.get(regular.id)}`);
  } finally {
    for (const t of tenants) {
      await admin.from("ai_actions").delete().eq("tenant_id", t);
      await admin.from("ai_runs").delete().eq("tenant_id", t);
      await admin.from("customer_offers").delete().eq("tenant_id", t);
      await admin.from("orders").delete().eq("tenant_id", t);
      await admin.from("devices").delete().eq("tenant_id", t);
      await admin.from("drivers").delete().eq("tenant_id", t);
      await admin.from("customers").update({ tenant_id: null }).eq("tenant_id", t);
      await admin.from("tenants").delete().eq("id", t);
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
