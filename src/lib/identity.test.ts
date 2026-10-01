import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone } from "./phone";
import { verifyMiniAppInitData } from "./telegram-miniapp";

describe("normalizePhone", () => {
  it.each([
    ["9876543210", "+919876543210"],
    ["98765 43210", "+919876543210"],
    ["098765-43210", "+919876543210"],
    ["+91 98765 43210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["0091 98765 43210", "+919876543210"],
    ["+1 415 555 0123", "+14155550123"],
  ])("%s → %s", (input, out) => {
    expect(normalizePhone(input)).toBe(out);
  });

  it.each(["", "12345", "5876543210", "+0123", "abcdefghij", "+91 98765"])("rejects %j", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it("formats Indian numbers for display", () => {
    expect(formatPhone("+919876543210")).toBe("+91 98765 43210");
    expect(formatPhone("+14155550123")).toBe("+14155550123");
  });
});

describe("verifyMiniAppInitData", () => {
  const TOKEN = "123:ABC";
  const NOW = 1_790_000_000;
  // Signs launch data exactly like Telegram does.
  const sign = (fields: Record<string, string>, token = TOKEN) => {
    const check = Object.entries(fields)
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join("\n");
    const secret = createHmac("sha256", "WebAppData").update(token).digest();
    const hash = createHmac("sha256", secret).update(check).digest("hex");
    return new URLSearchParams({ ...fields, hash }).toString();
  };
  const fields = { auth_date: String(NOW - 30), query_id: "AAE", user: JSON.stringify({ id: 1000000001, first_name: "Riya" }) };

  it("accepts genuine launch data and returns the Telegram user", () => {
    expect(verifyMiniAppInitData(sign(fields), TOKEN, NOW)).toEqual({ ok: true, telegramId: "1000000001", firstName: "Riya" });
  });

  it("rejects data where the user was swapped after signing", () => {
    const forged = sign(fields).replace(encodeURIComponent('"id":1000000001'), encodeURIComponent('"id":42'));
    expect(verifyMiniAppInitData(forged, TOKEN, NOW)).toEqual({ ok: false, error: "bad_hash" });
  });

  it("rejects data signed for another bot", () => {
    expect(verifyMiniAppInitData(sign(fields, "999:OTHER"), TOKEN, NOW)).toEqual({ ok: false, error: "bad_hash" });
  });

  it("rejects stale launch data", () => {
    expect(verifyMiniAppInitData(sign({ ...fields, auth_date: String(NOW - 2 * 86400) }), TOKEN, NOW)).toEqual({ ok: false, error: "expired" });
  });

  it("rejects empty or garbage input", () => {
    expect(verifyMiniAppInitData("", TOKEN, NOW).ok).toBe(false);
    expect(verifyMiniAppInitData("hash=zz", TOKEN, NOW).ok).toBe(false);
  });
});
