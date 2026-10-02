// Fails the build if anything that looks like a real credential is in the source. Runs before every build
// (npm "prebuild"), locally and on Vercel. Prints file and line, never the value. Placeholders and test
// fixtures must look fake (contain "Fake", "your-", "...", or be all one character).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIRS = ["src", "scripts", "supabase", "public", "."];
const SKIP = new Set(["node_modules", ".next", ".git", ".vercel", "package-lock.json", "check-secrets.mjs"]);
const EXT = /\.(ts|tsx|js|mjs|cjs|json|sql|md|env\.example|txt|yml|yaml|html|css)$/;

const PATTERNS = [
  ["Telegram bot token", /\b\d{8,10}:AA[A-Za-z0-9_-]{30,}/g],
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{16,}/g],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}/g],
  ["Gemini key", /\bAQ\.[A-Za-z0-9_-]{30,}/g],
  ["Google OAuth secret", /\bGOCSPX-[A-Za-z0-9_-]{20,}/g],
  ["Stripe secret key", /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}/g],
  ["Private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ["Service-role JWT", /\beyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}/g],
];
const looksFake = (s) => /fake|your-|\.\.\.|example|placeholder/i.test(s) || /^(.)\1+$/.test(s.replace(/[^A-Za-z0-9]/g, ""));

const files = [];
const walk = (dir, top) => {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (!top) walk(p, false);
    } else if (EXT.test(name) && st.size < 2_000_000) files.push(p);
  }
};
for (const d of DIRS) {
  try {
    if (d === ".") walk(ROOT, true);
    else walk(join(ROOT, d), false);
  } catch {
    /* folder may not exist */
  }
}

const hits = [];
for (const f of new Set(files)) {
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const [kind, re] of PATTERNS) {
      for (const m of line.matchAll(re)) if (!looksFake(m[0])) hits.push(`${relative(ROOT, f)}:${i + 1}  ${kind}`);
    }
  });
}

if (hits.length) {
  console.error(`\nSecret check failed: ${hits.length} possible credential(s) in source. Move them to environment variables.\n`);
  for (const h of hits) console.error(`  ${h}`);
  process.exit(1);
}
console.log(`Secret check passed (${new Set(files).size} files).`);
