// Startup check of the environment (run once from instrumentation.ts). In production a missing critical
// variable stops the server from starting, with a message naming it, instead of failing later on some request.
// Optional features (email, Telegram, AI) just log that they're off. Names only: values are never printed.

const ALWAYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
// Without these the deployed app can't do its job: server-side data access, the basket ingest, the daily cron.
const PRODUCTION = ["SUPABASE_SERVICE_ROLE_KEY", "DEVICE_BRIDGE_KEY", "CRON_SECRET"];
const OPTIONAL: Record<string, string[]> = {
  "Telegram driver bot": ["TELEGRAM_DRIVER_BOT_TOKEN", "TELEGRAM_DRIVER_WEBHOOK_SECRET", "TELEGRAM_DRIVER_BOT_USERNAME"],
  "Telegram customer messages": ["TELEGRAM_CUSTOMER_BOT_TOKEN"],
  "Log in with Telegram": ["TELEGRAM_CLIENT_ID", "TELEGRAM_CLIENT_SECRET"],
  "Email notifications": ["GMAIL_USER", "GMAIL_APP_PASSWORD"],
  "Toss AI language model": ["GEMINI_API_KEY"],
};

const missing = (names: string[]) => names.filter((n) => !process.env[n]?.trim());

export function checkEnv() {
  const production = process.env.VERCEL_ENV === "production";
  const critical = missing([...ALWAYS, ...(production ? PRODUCTION : [])]);
  if (critical.length) {
    const msg = `Missing required environment variable(s): ${critical.join(", ")}. See .env.example.`;
    if (production) throw new Error(msg);
    console.warn(`[env] ${msg}`);
  }
  for (const [feature, names] of Object.entries(OPTIONAL)) {
    const gone = missing(names);
    if (gone.length) console.warn(`[env] ${feature} is off: set ${gone.join(", ")} to enable it.`);
  }
}
