// Backs up every table to JSON files on this computer: `npm run backup`.
// Supabase's free plan has no downloadable backups, so run this weekly (and before any big database change).
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local, writes to ./backups/<date>/
// (that folder is git-ignored: it holds customer data and encrypted keys, so never commit or share it).
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* variables may already be set in the shell */
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local, then run again.");
  process.exit(1);
}

// every table the app owns (see supabase/migrations); rate_limits and payment_events are only short-lived counters
const TABLES = [
  "tenants", "customers", "drivers", "devices", "orders", "order_events", "driver_messages",
  "subscription_payments", "payment_intents", "plan_autorenew", "tenant_gateways", "platform_gateways", "platform_settings",
  "customer_payment_profiles", "customer_credits", "credit_grants", "customer_offers", "business_accounts",
  "supplies", "basket_requests", "deletion_requests", "email_optouts", "ai_runs", "ai_actions", "error_log",
];
const PAGE = 1000;
const db = createClient(url, key, { auth: { persistSession: false } });
const dir = join("backups", new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19));
mkdirSync(dir, { recursive: true });

let total = 0;
for (const table of TABLES) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select("*").range(from, from + PAGE - 1);
    if (error) {
      console.warn(`  skipped ${table}: ${error.message}`);
      break;
    }
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  writeFileSync(join(dir, `${table}.json`), JSON.stringify(rows, null, 1));
  total += rows.length;
  console.log(`  ${table}: ${rows.length}`);
}
console.log(`\nSaved ${total} rows to ${dir}/`);
console.log("Keep it somewhere private (an external drive or encrypted cloud folder). Never commit it.");
