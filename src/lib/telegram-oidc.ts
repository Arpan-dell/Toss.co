import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { fromTelegramPhone } from "./phone";

// "Log in with Telegram" via OpenID Connect (authorization code + PKCE).
// https://core.telegram.org/bots/telegram-login
// Endpoints match https://oauth.telegram.org/.well-known/openid-configuration.

export const TELEGRAM_ISSUER = "https://oauth.telegram.org";
const AUTH_URL = `${TELEGRAM_ISSUER}/auth`;
const TOKEN_URL = `${TELEGRAM_ISSUER}/token`;
const JWKS_URL = new URL(`${TELEGRAM_ISSUER}/.well-known/jwks.json`);
const ALGORITHMS = ["RS256", "ES256", "EdDSA"];

// httpOnly cookie holding { state, verifier } between /api/telegram/start and /callback.
export const OIDC_COOKIE = "tg_oidc";

export interface TelegramOidcConfig {
  clientId: string; // the bot's numeric ID
  clientSecret: string; // from BotFather → Login Widget
}

export function getTelegramOidcConfig(): TelegramOidcConfig | null {
  const clientId = process.env.TELEGRAM_CLIENT_ID;
  const clientSecret = process.env.TELEGRAM_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

export function createPkce() {
  const verifier = b64url(randomBytes(32));
  return {
    state: b64url(randomBytes(16)),
    verifier,
    challenge: b64url(createHash("sha256").update(verifier).digest()),
  };
}

export function buildAuthorizeUrl(p: { clientId: string; redirectUri: string; state: string; challenge: string }) {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: "code",
    scope: "openid profile phone", // phone: Telegram asks the user to share their verified number
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export async function exchangeCode(
  cfg: TelegramOidcConfig,
  p: { code: string; verifier: string; redirectUri: string },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: p.code,
      redirect_uri: p.redirectUri,
      client_id: cfg.clientId,
      code_verifier: p.verifier,
    }),
  });
  if (!res.ok) throw new Error(`token endpoint ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) throw new Error("token endpoint returned no id_token");
  return body.id_token;
}

let remoteJwks: JWTVerifyGetKey | undefined;

export type TelegramIdentity = { telegramId: string; name?: string; username?: string; phone?: string };

/**
 * Verifies the ID token's signature (Telegram's JWKS), issuer, audience (our bot ID) and expiry.
 * Returns the numeric Telegram user ID: the same value the ESP32 stored as ownerChatId.
 */
export async function verifyIdToken(idToken: string, clientId: string, jwks?: JWTVerifyGetKey): Promise<TelegramIdentity> {
  remoteJwks ??= createRemoteJWKSet(JWKS_URL);
  const { payload } = await jwtVerify(idToken, jwks ?? remoteJwks, {
    issuer: TELEGRAM_ISSUER,
    audience: clientId,
    algorithms: ALGORITHMS,
  });

  // Docs list a numeric `id` claim (the Telegram user ID); fall back to a numeric `sub`.
  const raw = payload.id ?? payload.sub;
  const telegramId = raw === undefined ? "" : String(raw);
  if (!/^\d{1,20}$/.test(telegramId)) throw new Error("ID token has no numeric Telegram user ID");

  return {
    telegramId,
    name: typeof payload.name === "string" ? payload.name : undefined,
    username: typeof payload.preferred_username === "string" ? payload.preferred_username : undefined,
    phone: fromTelegramPhone(payload.phone_number), // only when the user agreed to share it
  };
}
