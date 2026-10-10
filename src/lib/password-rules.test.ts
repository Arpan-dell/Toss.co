import { describe, expect, it } from "vitest";
import { PASSWORD_RULES, passwordError } from "./password-rules";

describe("password rules", () => {
  it("accepts a password with a letter, a number and a special character", () => {
    expect(passwordError("laundry7!")).toBeNull();
    expect(passwordError("Basket#2026")).toBeNull();
    expect(passwordError("धोबी_घाट9")).toBeNull(); // letters in any script count
  });

  it("names exactly what is missing", () => {
    expect(passwordError("laundry77")).toBe("Your password needs a special character, like @ # ! _.");
    expect(passwordError("laundry!!")).toBe("Your password needs a number.");
    expect(passwordError("12345678!")).toBe("Your password needs a letter.");
    expect(passwordError("abc")).toBe("Your password needs 8 or more characters, a number and a special character, like @ # ! _.");
  });

  it("doesn't count spaces as special characters", () => {
    expect(passwordError("laundry 77")).toBe("Your password needs a special character, like @ # ! _.");
  });

  it("rejects passwords over 72 characters", () => {
    expect(passwordError("a1!".repeat(25))).toBe("Use a password of at most 72 characters.");
  });

  it("every rule passes for a good password and fails for an empty one", () => {
    expect(PASSWORD_RULES.every((r) => r.ok("Toss@123"))).toBe(true);
    expect(PASSWORD_RULES.some((r) => r.ok(""))).toBe(false);
  });
});
