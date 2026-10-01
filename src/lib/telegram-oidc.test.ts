import { createHash } from "node:crypto";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { TELEGRAM_ISSUER, buildAuthorizeUrl, createPkce, exchangeCode, verifyIdToken } from "./telegram-oidc";

const CLIENT_ID = "8736340926";
let jwks: ReturnType<typeof createLocalJWKSet>;
let sign: (claims: Record<string, unknown>, opts?: { iss?: string; aud?: string; exp?: string }) => Promise<string>;
let otherKeySign: typeof sign;

beforeAll(async () => {
  const good = await generateKeyPair("RS256");
  const evil = await generateKeyPair("RS256");
  jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(good.publicKey)), kid: "oidc-1", alg: "RS256" }] });
  const make = (key: CryptoKey) => (claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: string } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "oidc-1" })
      .setIssuer(opts.iss ?? TELEGRAM_ISSUER)
      .setAudience(opts.aud ?? CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? "1h")
      .sign(key);
  sign = make(good.privateKey);
  otherKeySign = make(evil.privateKey);
});

describe("verifyIdToken", () => {
  it("returns the numeric Telegram ID from a valid token", async () => {
    const token = await sign({ id: 1000000001, sub: "abc", name: "Arpan", preferred_username: "arpan" });
    await expect(verifyIdToken(token, CLIENT_ID, jwks)).resolves.toEqual({
      telegramId: "1000000001",
      name: "Arpan",
      username: "arpan",
    });
  });

  it("returns the shared phone number in E.164, with or without the plus", async () => {
    expect((await verifyIdToken(await sign({ id: 1, phone_number: "919876543210" }), CLIENT_ID, jwks)).phone).toBe("+919876543210");
    expect((await verifyIdToken(await sign({ id: 1, phone_number: "+14155550123" }), CLIENT_ID, jwks)).phone).toBe("+14155550123");
    expect((await verifyIdToken(await sign({ id: 1 }), CLIENT_ID, jwks)).phone).toBeUndefined();
    expect((await verifyIdToken(await sign({ id: 1, phone_number: "12" }), CLIENT_ID, jwks)).phone).toBeUndefined();
  });

  it("falls back to a numeric sub when there is no id claim", async () => {
    const token = await sign({ sub: "1000000001" });
    await expect(verifyIdToken(token, CLIENT_ID, jwks)).resolves.toMatchObject({ telegramId: "1000000001" });
  });

  it("rejects a token signed by someone else", async () => {
    await expect(verifyIdToken(await otherKeySign({ id: 1 }), CLIENT_ID, jwks)).rejects.toThrow();
  });

  it("rejects a token issued for another bot", async () => {
    await expect(verifyIdToken(await sign({ id: 1 }, { aud: "999" }), CLIENT_ID, jwks)).rejects.toThrow();
  });

  it("rejects a token from another issuer", async () => {
    await expect(verifyIdToken(await sign({ id: 1 }, { iss: "https://evil.example" }), CLIENT_ID, jwks)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    await expect(verifyIdToken(await sign({ id: 1 }, { exp: "-1m" }), CLIENT_ID, jwks)).rejects.toThrow();
  });

  it("rejects a token without a numeric Telegram ID", async () => {
    await expect(verifyIdToken(await sign({ sub: "not-a-number" }), CLIENT_ID, jwks)).rejects.toThrow(/numeric/);
  });
});

describe("authorization request", () => {
  it("uses PKCE S256 with a challenge derived from the verifier", () => {
    const p = createPkce();
    expect(p.challenge).toBe(createHash("sha256").update(p.verifier).digest("base64url"));
    const url = new URL(buildAuthorizeUrl({ clientId: CLIENT_ID, redirectUri: "https://x.app/cb", ...p }));
    expect(url.origin + url.pathname).toBe("https://oauth.telegram.org/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: CLIENT_ID,
      redirect_uri: "https://x.app/cb",
      response_type: "code",
      scope: "openid profile phone",
      state: p.state,
      code_challenge_method: "S256",
    });
  });

  it("exchanges the code with client_secret_basic and the PKCE verifier", async () => {
    let seen: { headers: Record<string, string>; body: URLSearchParams } | undefined;
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      seen = { headers: init.headers as Record<string, string>, body: init.body as URLSearchParams };
      return new Response(JSON.stringify({ id_token: "tok" }), { status: 200 });
    }) as unknown as typeof fetch;

    const token = await exchangeCode({ clientId: CLIENT_ID, clientSecret: "s3cret" }, { code: "c", verifier: "v", redirectUri: "https://x.app/cb" }, fakeFetch);
    expect(token).toBe("tok");
    expect(seen?.headers.authorization).toBe(`Basic ${Buffer.from(`${CLIENT_ID}:s3cret`).toString("base64")}`);
    expect(Object.fromEntries(seen!.body)).toMatchObject({ grant_type: "authorization_code", code: "c", code_verifier: "v" });
  });
});
