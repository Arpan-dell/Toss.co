/**
 * Live check that the deployed site emails on a subscription payment: a throwaway manager (a +alias
 * of the Toss Gmail, so their mail lands in the same inbox) submits a 3-month payment through the
 * real Billing form. Expect two emails in the Toss Gmail: the owner's "payment to confirm" alert and
 * the manager's receipt. Deletes the business, payment and user afterwards.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=… GMAIL_USER=toss.smartlaundry@gmail.com npx tsx scripts/e2e-email.ts
 */
import { randomBytes } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { need } from "./env";

const SITE = process.env.TOSS_SITE ?? "https://toss-code-x-a24a.vercel.app";
const SB_URL = need("NEXT_PUBLIC_SUPABASE_URL");
const PUB = need("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const SECRET = must("SUPABASE_SERVICE_ROLE_KEY");
const GMAIL = must("GMAIL_USER");

const RUN = Date.now();
const PASSWORD = randomBytes(12).toString("base64url");
const REF = `E2EMAIL${String(RUN).slice(-8)}`;

function must(k: string) {
  const v = process.env[k];
  if (!v) throw new Error(`Set ${k}`);
  return v;
}

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

// Calls a server action the way React does for a useActionState form: fields first, then the root.
async function callAction(path: string, cookie: string, id: string, fields: Record<string, string>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(`_1_${k}`, v);
  body.set("0", JSON.stringify([{}, "$K1"]));
  const res = await fetch(SITE + path, { method: "POST", headers: { cookie, "next-action": id, accept: "text/x-component" }, body });
  return res.text();
}

async function main() {
  const [local, domain] = GMAIL.split("@");
  const email = `${local}+e2e${RUN}@${domain}`;
  let userId = "";
  let tenantId = "";
  let ok = false;
  try {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    const reg = await admin.rpc("register_business", { p_user: userId, p_name: "Email Test Laundry", p_upi_id: "et@okaxis", p_upi_name: "ET", p_price: 50 });
    if (reg.error) throw reg.error;
    tenantId = (reg.data as { tenant_id: string }).tenant_id;

    const cookie = await cookiesFor(email);
    const html = await fetch(`${SITE}/admin/billing?months=3`, { headers: { cookie } }).then((r) => r.text());
    const ids = [...new Set(html.match(/\b[0-9a-f]{42}\b/g) ?? [])];
    console.log(`billing page references ${ids.length} server action(s)`);
    for (const id of ids) {
      const out = await callAction("/admin/billing", cookie, id, { months: "3", ref: REF });
      if (out.includes("Payment submitted")) {
        console.log("submitted through the live Billing form:", out.match(/Payment submitted[^"]*/)?.[0]);
        ok = true;
        break;
      }
    }
    const { data: p } = await admin.from("subscription_payments").select("amount, discount_pct, months").eq("payment_ref", REF).maybeSingle();
    console.log(ok && p ? `PASS  payment recorded: ${JSON.stringify(p)}` : "FAIL  payment not submitted");
    console.log(`\nCheck ${GMAIL}: "💳 Subscription payment to confirm: Email Test Laundry" and "We got your Toss payment" (to ${email}).`);
  } finally {
    if (tenantId) {
      await admin.from("subscription_payments").delete().eq("tenant_id", tenantId);
      await admin.from("tenants").delete().eq("id", tenantId);
    }
    if (userId) await admin.auth.admin.deleteUser(userId);
    console.log("cleaned up test data");
  }
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
