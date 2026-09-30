import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyTelegramLogin } from "./telegram";

const BOT_TOKEN = "123456:TEST-token";
const NOW = 1_790_000_000;

// Signs a payload exactly like Telegram does.
function sign(fields: Record<string, string>, token = BOT_TOKEN) {
  const check = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secret = createHash("sha256").update(token).digest();
  return { ...fields, hash: createHmac("sha256", secret).update(check).digest("hex") };
}

const fields = { id: "1000000001", first_name: "Arpan", username: "arpan", auth_date: String(NOW - 60) };

describe("verifyTelegramLogin", () => {
  it("accepts a correctly signed, fresh payload", () => {
    expect(verifyTelegramLogin(sign(fields), BOT_TOKEN, NOW)).toEqual({
      ok: true,
      telegramId: "1000000001",
      firstName: "Arpan",
      username: "arpan",
    });
  });

  it("rejects a payload whose ID was changed after signing", () => {
    const tampered = { ...sign(fields), id: "999" };
    expect(verifyTelegramLogin(tampered, BOT_TOKEN, NOW)).toEqual({ ok: false, error: "bad_hash" });
  });

  it("rejects a payload signed with another bot's token", () => {
    expect(verifyTelegramLogin(sign(fields, "other:token"), BOT_TOKEN, NOW)).toEqual({ ok: false, error: "bad_hash" });
  });

  it("rejects a garbage hash without throwing", () => {
    expect(verifyTelegramLogin({ ...fields, hash: "zz" }, BOT_TOKEN, NOW)).toEqual({ ok: false, error: "bad_hash" });
  });

  it("rejects stale logins", () => {
    const old = sign({ ...fields, auth_date: String(NOW - 2 * 24 * 3600) });
    expect(verifyTelegramLogin(old, BOT_TOKEN, NOW)).toEqual({ ok: false, error: "expired" });
  });

  it("rejects missing fields", () => {
    expect(verifyTelegramLogin({ id: "1" }, BOT_TOKEN, NOW)).toEqual({ ok: false, error: "missing_fields" });
  });
});
