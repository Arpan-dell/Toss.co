import { afterEach, describe, expect, it, vi } from "vitest";

// site.ts reads the env at import time, so each case loads a fresh copy
async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  return import("./site");
}
afterEach(() => vi.unstubAllEnvs());

const HOSTS = { SITE_URL: "https://tosslaundry.online", APP_URL: "https://app.tosslaundry.online" };

describe("hostRedirect", () => {
  it("sends app paths on the website host to the app host, keeping the query", async () => {
    const { hostRedirect } = await load(HOSTS);
    expect(hostRedirect("tosslaundry.online", "/login", "?next=%2Flaundries")).toBe("https://app.tosslaundry.online/login?next=%2Flaundries");
    expect(hostRedirect("tosslaundry.online", "/admin/orders/x", "")).toBe("https://app.tosslaundry.online/admin/orders/x");
    expect(hostRedirect("tosslaundry.online", "/invoice/abc", "")).toBe("https://app.tosslaundry.online/invoice/abc");
  });
  it("sends website pages on the app host back, and the app host's root to sign-in", async () => {
    const { hostRedirect } = await load(HOSTS);
    expect(hostRedirect("app.tosslaundry.online", "/", "")).toBe("https://app.tosslaundry.online/login");
    expect(hostRedirect("app.tosslaundry.online", "/privacy", "")).toBe("https://tosslaundry.online/privacy");
  });
  it("leaves shared paths, look-alike paths and other hosts alone", async () => {
    const { hostRedirect } = await load(HOSTS);
    expect(hostRedirect("tosslaundry.online", "/laundries", "")).toBeNull();
    expect(hostRedirect("app.tosslaundry.online", "/laundries", "")).toBeNull();
    expect(hostRedirect("tosslaundry.online", "/application", "")).toBeNull();
    expect(hostRedirect("app.tosslaundry.online", "/app", "")).toBeNull();
    expect(hostRedirect("toss-code-x-a24a.vercel.app", "/login", "")).toBeNull();
    expect(hostRedirect("localhost:3000", "/", "")).toBeNull();
  });
  it("does nothing until the app host is configured", async () => {
    const { hostRedirect } = await load({ SITE_URL: "https://tosslaundry.online", APP_URL: undefined });
    expect(hostRedirect("tosslaundry.online", "/login", "")).toBeNull();
  });
});

describe("sessionCookieDomain", () => {
  it("shares the cookie across the two hosts only", async () => {
    const { sessionCookieDomain } = await load({ AUTH_COOKIE_DOMAIN: ".tosslaundry.online" });
    expect(sessionCookieDomain("app.tosslaundry.online")).toBe(".tosslaundry.online");
    expect(sessionCookieDomain("tosslaundry.online")).toBe(".tosslaundry.online");
    expect(sessionCookieDomain("eviltosslaundry.online")).toBeUndefined();
    expect(sessionCookieDomain("toss-code-x-a24a.vercel.app")).toBeUndefined();
    expect(sessionCookieDomain("localhost:3000")).toBeUndefined();
  });
  it("is host-only when not configured", async () => {
    const { sessionCookieDomain } = await load({ AUTH_COOKIE_DOMAIN: undefined });
    expect(sessionCookieDomain("app.tosslaundry.online")).toBeUndefined();
  });
});
