import { describe, expect, it } from "vitest";
import { redact } from "./log";

describe("redact", () => {
  it("removes emails, phones, Telegram IDs, tokens, JWTs and UUIDs", () => {
    // All sample values are made up: never paste a real credential into a test.
    const raw =
      'duplicate key: Key (phone)=(+919876543210) already exists for asha@example.com; chat 1234567890; ' +
      "bot 1111111111:AAFakeFakeFakeFakeFakeFakeFakeFake00; Bearer abc.def.ghi; user 3f2b9c1e-1111-4a2b-9c3d-123456789abc; " +
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig";
    const out = redact(raw);
    for (const leak of ["+919876543210", "asha@example.com", "1234567890", "AAFakeFake", "abc.def.ghi", "3f2b9c1e", "eyJhbGci"]) {
      expect(out).not.toContain(leak);
    }
    expect(out).toContain("duplicate key");
  });
});
