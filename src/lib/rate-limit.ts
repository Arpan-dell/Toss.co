import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { logError } from "./log";
import { countHit } from "./cache";
import { isSupabaseConfigured, supabaseAdmin } from "./supabase/admin";

// Per-visitor limits for sensitive or costly actions. Supabase Auth also rate-limits, but it sees every
// request coming from our servers, so it can't tell visitors apart; these limits key on the visitor's IP (or
// account) instead. Identifiers are hashed before they reach the database.
export const LIMITS = {
  signInIp: { limit: 5, windowSec: 60 }, // 5 sign-in attempts per minute per IP
  signInAccount: { limit: 10, windowSec: 15 * 60 }, // and 10 per 15 minutes per email, from anywhere
  signUpIp: { limit: 5, windowSec: 60 * 60 },
  passwordChange: { limit: 3, windowSec: 60 * 60 }, // per account, like a password reset
  sensitiveChange: { limit: 10, windowSec: 60 * 60 }, // password re-checks for important settings, per account
  oauthStartIp: { limit: 10, windowSec: 60 },
  geocodeIp: { limit: 10, windowSec: 60 }, // OpenStreetMap's geocoder allows ~1 request/second for the whole app
  directoryIp: { limit: 30, windowSec: 60 },
  resetRequestIp: { limit: 3, windowSec: 60 * 60 }, // password reset emails: 3 per hour per IP
  resetRequestAccount: { limit: 3, windowSec: 60 * 60 }, // and per account
  resetSubmitIp: { limit: 10, windowSec: 60 * 60 },
  basketRequestIp: { limit: 3, windowSec: 60 * 60 }, // "Get a basket" requests
  assistant: { limit: 40, windowSec: 10 * 60 }, // in-app assistant questions per account (keeps the free AI quota safe)
} as const;

/** The caller's IP as seen by Vercel's edge (first x-forwarded-for hop). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

/** Counts one attempt; false when over the limit. Fails open (allows) if the limiter itself is unavailable. */
export async function allow(bucket: keyof typeof LIMITS, identifier: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return true;
  const { limit, windowSec } = LIMITS[bucket];
  const key = `${bucket}:${createHash("sha256").update(identifier.toLowerCase()).digest("hex").slice(0, 32)}`;
  // Redis counter when one is connected (no database round trip); the Postgres limiter otherwise
  const count = await countHit(`rl:${key}`, windowSec);
  if (count !== null) return count <= limit;
  const { data, error } = await supabaseAdmin().rpc("rate_limit_hit", { p_key: key, p_limit: limit, p_window_seconds: windowSec });
  if (error) {
    logError("rate limiter unavailable", error);
    return true;
  }
  return data === true;
}
