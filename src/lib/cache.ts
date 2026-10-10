import "server-only";
import { logError } from "./log";

// Shared cache for data that is the same for every visitor (platform prices, laundry search results, geocoded
// places) and for rate-limit counters. Uses Redis when one is connected: Upstash over HTTPS (works from Vercel
// functions, free plan, no card), set up either as UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN or through
// Vercel's Upstash integration (KV_REST_API_URL + KV_REST_API_TOKEN). In front of Redis, and on its own when no
// Redis is set up, each server instance keeps a short in-memory copy, so a warm function doesn't even make the
// Redis round trip. Every Redis failure falls back to loading fresh: the cache can make the site faster, never
// break it.

const URL_ = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const PREFIX = "toss:";
const LOCAL_MAX_SEC = 30; // the in-memory copy never outlives this, so instances agree within half a minute
const LOCAL_MAX_ENTRIES = 500;
const TIMEOUT_MS = 800; // a slow Redis must not slow the page down

export const redisConfigured = () => Boolean(URL_ && TOKEN);

const local = new Map<string, { value: unknown; until: number }>();

async function redis<T = unknown>(commands: (string | number)[][]): Promise<T[] | null> {
  if (!URL_ || !TOKEN) return null;
  try {
    const res = await fetch(`${URL_}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`redis ${res.status}`);
    const out = (await res.json()) as { result?: T; error?: string }[];
    if (out.some((r) => r.error)) throw new Error(out.find((r) => r.error)?.error);
    return out.map((r) => r.result as T);
  } catch (err) {
    logError("redis unavailable", err instanceof Error ? err.message : err);
    return null;
  }
}

function remember(key: string, value: unknown, ttlSec: number) {
  if (local.size >= LOCAL_MAX_ENTRIES) local.delete(local.keys().next().value as string);
  local.set(key, { value, until: Date.now() + Math.min(ttlSec, LOCAL_MAX_SEC) * 1000 });
}

/**
 * The cached value for `key`, or `load()`'s result (then cached for `ttlSec`). Only cache data that is the same
 * for everyone who can reach this call: the cache doesn't know who is asking.
 */
export async function cached<T>(key: string, ttlSec: number, load: () => Promise<T>): Promise<T> {
  const k = PREFIX + key;
  const hit = local.get(k);
  if (hit && hit.until > Date.now()) return hit.value as T;

  const got = await redis<string | null>([["GET", k]]);
  if (got && got[0] != null) {
    try {
      const value = JSON.parse(got[0]) as T;
      remember(k, value, ttlSec);
      return value;
    } catch {
      // a bad entry: load fresh and overwrite it
    }
  }
  const value = await load();
  if (value !== undefined) {
    remember(k, value, ttlSec);
    await redis([["SET", k, JSON.stringify(value), "EX", ttlSec]]);
  }
  return value;
}

/** Drops cached keys everywhere this instance can reach (its memory and Redis). Call after writing the data. */
export async function invalidate(...keys: string[]) {
  for (const key of keys) local.delete(PREFIX + key);
  if (keys.length) await redis([["DEL", ...keys.map((k) => PREFIX + k)]]);
}

/**
 * Counts one hit in a fixed window and returns the count, or null when Redis isn't available (the caller then
 * uses its own fallback). INCR and EXPIRE NX in one round trip: the window starts at the first hit.
 */
export async function countHit(key: string, windowSec: number): Promise<number | null> {
  const out = await redis<number>([
    ["INCR", PREFIX + key],
    ["EXPIRE", PREFIX + key, windowSec, "NX"],
  ]);
  return out ? Number(out[0]) : null;
}

/** Cache keys used in more than one place, so writers can clear what readers cached. */
export const KEYS = {
  publicPlan: "plan:public",
  platformSettings: "plan:settings",
} as const;
