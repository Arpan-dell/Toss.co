/**
 * Live check of Settings → Password against the real database: calls the changePassword server
 * action the way the browser form does, as a throwaway customer, then deletes the user.
 *
 * Server action IDs differ per build, so run it against your own production build:
 *   npm run build && SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx next start -p 3105
 *   TOSS_SITE=http://localhost:3105 SUPABASE_SERVICE_ROLE_KEY=… CHANGE_PASSWORD_ACTION_ID=… npx tsx scripts/e2e-password.ts
 *
 * The action ID is the changePassword entry in .next/server/server-reference-manifest.json.
 */
import { randomBytes } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { need } from "./env";

const SITE = process.env.TOSS_SITE ?? "https://tosslaundry.online";
const SB_URL = need("NEXT_PUBLIC_SUPABASE_URL");
const PUB = need("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const SECRET = must("SUPABASE_SERVICE_ROLE_KEY");
const ACTION = must("CHANGE_PASSWORD_ACTION_ID");

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

async function cookiesFor(email: string, password: string): Promise<string> {
  const jar = new Map<string, string>();
  const ssr = createServerClient(SB_URL, PUB, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cs) => cs.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await ssr.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
}

// Same wire format React uses for a useActionState form: args [prevState, FormData].
async function changePassword(cookie: string, fields: Record<string, string>) {
  const body = new FormData();
  // FormData arg #1: its fields are prefixed "_1_" and must come before the root ("0"), as React sends them.
  for (const [k, v] of Object.entries(fields)) body.set(`_1_${k}`, v);
  body.set("0", JSON.stringify([{}, "$K1"]));
  const res = await fetch(`${SITE}/app/settings`, { method: "POST", headers: { cookie, "next-action": ACTION, accept: "text/x-component" }, body });
  return { status: res.status, text: await res.text() };
}

const canSignIn = async (email: string, password: string) => {
  const c = createClient(SB_URL, PUB, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  return !error;
};

async function main() {
  const email = `pw-${Date.now()}@toss-test.invalid`;
  const oldPw = randomBytes(12).toString("base64url");
  const newPw = randomBytes(12).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password: oldPw, email_confirm: true });
  if (error) throw error;
  try {
    const cookie = await cookiesFor(email, oldPw);

    const wrong = await changePassword(cookie, { current: "not-my-password", next: newPw, confirm: newPw });
    check("wrong current password is refused", wrong.text.includes("current password is wrong"), wrong.text.slice(0, 160));

    const mismatch = await changePassword(cookie, { current: oldPw, next: newPw, confirm: newPw + "x" });
    check("mismatched confirmation is refused", mismatch.text.includes("don't match") || mismatch.text.includes("don\\u0027t match"));

    const short = await changePassword(cookie, { current: oldPw, next: "short", confirm: "short" });
    check("too-short password is refused", short.text.includes("at least 8 characters"));
    check("password unchanged after refusals", await canSignIn(email, oldPw));

    const ok = await changePassword(cookie, { current: oldPw, next: newPw, confirm: newPw });
    check("correct current password changes it", ok.text.includes("Password changed"), ok.text.slice(0, 160));
    check("new password works", await canSignIn(email, newPw));
    check("old password no longer works", !(await canSignIn(email, oldPw)));

    const anon = await changePassword("", { current: newPw, next: oldPw, confirm: oldPw });
    check("signed-out request can't change anything", !anon.text.includes("Password changed") && (await canSignIn(email, newPw)));
  } finally {
    await admin.auth.admin.deleteUser(data.user.id);
    console.log("cleaned up test data");
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
