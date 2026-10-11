import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./supabase/admin", () => ({ isSupabaseConfigured: () => false, supabaseAdmin: () => ({}) }));

describe("unsubscribe links", () => {
  let mod: typeof import("./unsubscribe");
  beforeAll(async () => {
    process.env.UNSUBSCRIBE_SECRET = "test-secret-not-real";
    mod = await import("./unsubscribe");
  });

  const parts = (url: string) => {
    const u = new URL(url);
    return [u.searchParams.get("e")!, u.searchParams.get("c")!, u.searchParams.get("t")!] as const;
  };

  it("round-trips a signed link", () => {
    const [e, c, t] = parts(mod.unsubscribeUrl("Manager@Example.com", "alerts"));
    expect(mod.readUnsubscribeLink(e, c, t)).toEqual({ email: "manager@example.com", category: "alerts" });
  });

  it("rejects a link pointed at someone else or another kind of email", () => {
    const [e, c, t] = parts(mod.unsubscribeUrl("a@example.com", "alerts"));
    const other = Buffer.from("b@example.com").toString("base64url");
    expect(mod.readUnsubscribeLink(other, c, t)).toBeNull();
    expect(mod.readUnsubscribeLink(e, "reminders", t)).toBeNull();
    expect(mod.readUnsubscribeLink(e, "everything", t)).toBeNull();
    expect(mod.readUnsubscribeLink(e, c, `${t.slice(0, -1)}x`)).toBeNull();
    expect(mod.readUnsubscribeLink(undefined, c, t)).toBeNull();
  });
});
