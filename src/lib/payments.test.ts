import { describe, expect, it } from "vitest";
import { planState } from "./plan";
import { buildUpiUri, detectUpiPlatform, isValidUpiId, normalizePaymentRef, upiAppLinks } from "./upi";

describe("UPI app links", () => {
  const uri = buildUpiUri({ payeeUpiId: "9311547292@sbi", payeeName: "Fresh", amount: 499, note: "Toss 1 month" });
  const query = uri.slice("upi://pay?".length);

  it("detects the platform from the user agent", () => {
    expect(detectUpiPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("android");
    expect(detectUpiPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("ios");
    expect(detectUpiPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("desktop");
  });

  it("targets each Android app by package, with payee and amount pre-filled", () => {
    const links = upiAppLinks(uri, "android");
    const gpay = links.find((l) => l.id === "gpay")!;
    expect(gpay.href).toBe(`intent://pay?${query}#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end`);
    expect(gpay.href).toContain("pa=9311547292%40sbi");
    expect(gpay.href).toContain("am=499.00");
    expect(links.map((l) => l.id)).toEqual(["gpay", "phonepe", "paytm", "bhim", "amazonpay", "cred", "whatsapp", "other"]);
  });

  it("uses each app's own scheme on iOS", () => {
    const links = upiAppLinks(uri, "ios");
    expect(links.find((l) => l.id === "phonepe")!.href).toBe(`phonepe://pay?${query}`);
    expect(links.find((l) => l.id === "gpay")!.href).toBe(`gpay://upi/pay?${query}`);
    expect(links.at(-1)).toMatchObject({ id: "other", href: uri });
  });

  it("offers no app buttons on desktop (QR instead)", () => {
    expect(upiAppLinks(uri, "desktop")).toEqual([]);
  });
});

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

describe("tierOf", () => {
  it("is Pro in trial or paid time, Free once it runs out, and locked only when suspended", async () => {
    const { tierOf } = await import("./plan");
    expect(tierOf("TRIAL")).toBe("PRO");
    expect(tierOf("ACTIVE")).toBe("PRO");
    expect(tierOf("EXPIRED")).toBe("FREE");
    expect(tierOf("SUSPENDED")).toBe("LOCKED");
  });
});
