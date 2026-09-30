import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Verifies data from the Telegram Login Widget.
// https://core.telegram.org/widgets/login#checking-authorization
//   secret = SHA256(bot_token)
//   hash   = HMAC_SHA256(secret, "key=value\n…" of every field except hash, sorted by key)
// The widget ID of the signed-in Telegram user equals the private chat_id the ESP32 stored.

export const TELEGRAM_AUTH_MAX_AGE_S = 24 * 60 * 60;

export type TelegramAuthResult =
  | { ok: true; telegramId: string; firstName?: string; username?: string }
  | { ok: false; error: "missing_fields" | "bad_hash" | "expired" };

export function verifyTelegramLogin(
  params: Record<string, string>,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): TelegramAuthResult {
  const { hash, ...fields } = params;
  if (!hash || !fields.id || !fields.auth_date) return { ok: false, error: "missing_fields" };

  const checkString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secret = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(checkString).digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, error: "bad_hash" };

  const age = nowSeconds - Number(fields.auth_date);
  if (!Number.isFinite(age) || age > TELEGRAM_AUTH_MAX_AGE_S || age < -300) return { ok: false, error: "expired" };

  return { ok: true, telegramId: fields.id, firstName: fields.first_name, username: fields.username };
}
