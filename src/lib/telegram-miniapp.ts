import { createHmac, timingSafeEqual } from "node:crypto";

// Verifies Telegram Mini App launch data (window.Telegram.WebApp.initData).
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//   secret = HMAC_SHA256(key = "WebAppData", data = bot_token)
//   hash   = HMAC_SHA256(key = secret, data = "key=value\n…" of every field except hash, sorted)
// Only the bot that opened the Mini App can produce a valid hash, so the user ID inside is genuine.

export const MINIAPP_MAX_AGE_S = 24 * 60 * 60;

export type MiniAppResult = { ok: true; telegramId: string; firstName?: string } | { ok: false; error: "bad_hash" | "expired" | "no_user" };

export function verifyMiniAppInitData(initData: string, botToken: string, nowSeconds = Math.floor(Date.now() / 1000)): MiniAppResult {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash") ?? "";
  params.delete("hash");
  const check = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(check).digest();
  const got = Buffer.from(hash, "hex");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return { ok: false, error: "bad_hash" };

  const age = nowSeconds - Number(params.get("auth_date"));
  if (!Number.isFinite(age) || age > MINIAPP_MAX_AGE_S || age < -300) return { ok: false, error: "expired" };

  try {
    const user = JSON.parse(params.get("user") ?? "") as { id?: number; first_name?: string };
    if (!user.id) return { ok: false, error: "no_user" };
    return { ok: true, telegramId: String(user.id), firstName: user.first_name };
  } catch {
    return { ok: false, error: "no_user" };
  }
}
