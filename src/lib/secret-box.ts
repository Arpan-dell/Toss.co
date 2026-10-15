import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Encrypts laundries' payment gateway keys before they're stored (AES-256-GCM), so the database alone never
// reveals them. The key is GATEWAY_SECRET_KEY (32 random bytes, base64) when set; otherwise it's derived from the
// Supabase service-role key. If that key is ever rotated without GATEWAY_SECRET_KEY set, laundries reconnect
// their gateway (the old encrypted keys can no longer be read).

function key(): Buffer {
  const own = process.env.GATEWAY_SECRET_KEY;
  if (own) {
    const k = Buffer.from(own, "base64");
    if (k.length !== 32) throw new Error("GATEWAY_SECRET_KEY must be 32 bytes, base64-encoded");
    return k;
  }
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("No key to encrypt gateway secrets");
  return Buffer.from(hkdfSync("sha256", base, "toss", "gateway-secrets-v1", 32));
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function open(sealed: string): string {
  const [v, iv, tag, ct] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unreadable secret");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}
