import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// cache.ts reads its Redis settings at import, so each test imports a fresh copy with the env it needs.
async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("./cache");
}
const NO_REDIS = { UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined, KV_REST_API_URL: undefined, KV_REST_API_TOKEN: undefined };

describe("cache without Redis (in-memory only)", () => {
  it("loads once, then serves the cached value", async () => {
    const { cached } = await load(NO_REDIS);
    const loader = vi.fn(async () => ({ price: 899 }));
    expect(await cached("t:a", 60, loader)).toEqual({ price: 899 });
    expect(await cached("t:a", 60, loader)).toEqual({ price: 899 });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("doesn't cache a failed load", async () => {
    const { cached } = await load(NO_REDIS);
    const loader = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(42);
    await expect(cached("t:b", 60, loader)).rejects.toThrow("down");
    expect(await cached("t:b", 60, loader)).toBe(42);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("loads fresh after invalidate", async () => {
    const { cached, invalidate } = await load(NO_REDIS);
    const loader = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    expect(await cached("t:c", 60, loader)).toBe(1);
    await invalidate("t:c");
    expect(await cached("t:c", 60, loader)).toBe(2);
  });

  it("has no counter, so the rate limiter falls back to Postgres", async () => {
    const { countHit, redisConfigured } = await load(NO_REDIS);
    expect(redisConfigured()).toBe(false);
    expect(await countHit("rl:x", 60)).toBeNull();
  });
});

describe("cache with Redis (Upstash REST)", () => {
  const calls: unknown[] = [];
  let store: Record<string, string> = {};
  beforeEach(() => {
    calls.length = 0;
    store = {};
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      const cmds = JSON.parse(init.body) as (string | number)[][];
      calls.push(...cmds);
      const out = cmds.map(([op, key, val]) => {
        if (op === "GET") return { result: store[key as string] ?? null };
        if (op === "SET") return (store[key as string] = String(val)), { result: "OK" };
        if (op === "INCR") return { result: (store[key as string] = String(Number(store[key as string] ?? 0) + 1)) && Number(store[key as string]) };
        return { result: 1 };
      });
      return new Response(JSON.stringify(out), { status: 200 });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("stores in Redis with a TTL and reads it back from another instance", async () => {
    const a = await load({ ...NO_REDIS, UPSTASH_REDIS_REST_URL: "https://r.example", UPSTASH_REDIS_REST_TOKEN: "fake-token" });
    await a.cached("t:d", 300, async () => ({ ok: true }));
    expect(calls).toContainEqual(["SET", "toss:t:d", JSON.stringify({ ok: true }), "EX", 300]);
    const b = await load({ ...NO_REDIS, UPSTASH_REDIS_REST_URL: "https://r.example", UPSTASH_REDIS_REST_TOKEN: "fake-token" });
    const loader = vi.fn();
    expect(await b.cached("t:d", 300, loader)).toEqual({ ok: true });
    expect(loader).not.toHaveBeenCalled();
  });

  it("counts hits in a window", async () => {
    const c = await load({ ...NO_REDIS, KV_REST_API_URL: "https://r.example", KV_REST_API_TOKEN: "fake-token" });
    expect(await c.countHit("rl:y", 60)).toBe(1);
    expect(await c.countHit("rl:y", 60)).toBe(2);
    expect(calls).toContainEqual(["EXPIRE", "toss:rl:y", 60, "NX"]);
  });

  it("falls back to loading when Redis errors", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 500 }));
    const d = await load({ ...NO_REDIS, UPSTASH_REDIS_REST_URL: "https://r.example", UPSTASH_REDIS_REST_TOKEN: "fake-token" });
    expect(await d.cached("t:e", 60, async () => "fresh")).toBe("fresh");
    expect(await d.countHit("rl:z", 60)).toBeNull();
  });
});
