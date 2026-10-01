import { describe, expect, it } from "vitest";
import { planState } from "./plan";
import { buildUpiUri, isValidUpiId, normalizePaymentRef } from "./upi";

describe("UPI", () => {
  it.each(["laundry.delhi@okaxis", "9876543210@ybl", "a_b-c@paytm"])("accepts %s", (id) => {
    expect(isValidUpiId(id)).toBe(true);
  });

  it.each(["", "nobank", "@ybl", "x@", "has space@ybl", "a@1bank"])("rejects %j", (id) => {
    expect(isValidUpiId(id)).toBe(false);
  });

  it("builds a pay link with amount, payee and note", () => {
    const uri = buildUpiUri({ payeeUpiId: " Laundry.Delhi@OKAXIS ", payeeName: "Fresh Fold", amount: 422, note: "Toss pickup #104", reference: "TOSS-104" });
    expect(uri.startsWith("upi://pay?")).toBe(true);
    const q = new URLSearchParams(uri.slice("upi://pay?".length));
    expect(Object.fromEntries(q)).toEqual({
      pa: "laundry.delhi@okaxis",
      pn: "Fresh Fold",
      am: "422.00",
      cu: "INR",
      tn: "Toss pickup #104",
      tr: "TOSS104",
    });
    expect(uri).not.toContain("+"); // spaces as %20 for UPI apps
  });

  it("refuses bad payees or amounts", () => {
    expect(() => buildUpiUri({ payeeUpiId: "nope", payeeName: "x", amount: 1, note: "" })).toThrow();
    expect(() => buildUpiUri({ payeeUpiId: "a@ybl", payeeName: "x", amount: 0, note: "" })).toThrow();
  });

  it("normalises the payer's transaction reference", () => {
    expect(normalizePaymentRef(" 4123 5678 9012 ")).toBe("412356789012");
    expect(normalizePaymentRef("abc")).toBeNull();
    expect(normalizePaymentRef("12345678#")).toBeNull();
  });
});

describe("planState", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  it("is in trial until the trial ends", () => {
    expect(planState({ planStatus: "TRIAL", trialEndsAt: "2026-10-11T00:00:00Z" }, now)).toEqual({
      state: "TRIAL",
      until: "2026-10-11T00:00:00Z",
      daysLeft: 10,
    });
  });
  it("is active while paid up, even if the trial ended", () => {
    expect(planState({ planStatus: "ACTIVE", trialEndsAt: "2026-09-01T00:00:00Z", paidUntil: "2026-11-01T00:00:00Z" }, now).state).toBe("ACTIVE");
  });
  it("expires when both trial and payment have lapsed", () => {
    expect(planState({ planStatus: "ACTIVE", trialEndsAt: "2026-09-01T00:00:00Z", paidUntil: "2026-09-20T00:00:00Z" }, now).state).toBe("EXPIRED");
  });
  it("suspension overrides everything", () => {
    expect(planState({ planStatus: "SUSPENDED", paidUntil: "2027-01-01T00:00:00Z" }, now).state).toBe("SUSPENDED");
  });
});
