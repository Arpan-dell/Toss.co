import { describe, expect, it } from "vitest";
import { reminderFor } from "../plan";
import { APP_URL } from "../site";
import * as t from "./templates";

const NOW = new Date("2026-10-10T06:00:00Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();

describe("renewal reminder schedule", () => {
  const trial = (d: number) => reminderFor({ planStatus: "TRIAL", trialEndsAt: inDays(d) }, NOW);
  const paid = (d: number) => reminderFor({ planStatus: "ACTIVE", trialEndsAt: inDays(-60), paidUntil: inDays(d) }, NOW);

  it("reminds paid businesses 7, 3 and 1 days before, then when it ends", () => {
    expect(paid(20)).toBeNull();
    expect(paid(6.5)?.key).toMatch(/^ACTIVE:.*:7$/);
    expect(paid(2.5)?.key).toMatch(/:3$/);
    expect(paid(0.5)).toMatchObject({ daysLeft: 1 });
    expect(paid(0.5)?.key).toMatch(/:1$/);
    expect(paid(-1)).toMatchObject({ kind: "ACTIVE", daysLeft: 0 });
    expect(paid(-1)?.key).toMatch(/:0$/);
  });

  it("reminds trials 3 and 1 days before, and when it ends", () => {
    expect(trial(5)).toBeNull();
    expect(trial(2)?.key).toMatch(/^TRIAL:.*:3$/);
    expect(trial(-2)).toMatchObject({ kind: "TRIAL", daysLeft: 0 });
  });

  it("one email per step as the days pass (daily job, same paid-until date)", () => {
    const fields = { planStatus: "ACTIVE" as const, paidUntil: inDays(7.5) };
    const daily = Array.from({ length: 10 }, (_, i) => reminderFor(fields, new Date(NOW.getTime() + i * 86_400_000))?.key);
    const distinct = new Set(daily.filter(Boolean));
    expect([...distinct].map((k) => k!.split(":").pop())).toEqual(["7", "3", "1", "0"]);
  });

  it("stays quiet for suspended or long-lapsed businesses", () => {
    expect(reminderFor({ planStatus: "SUSPENDED", paidUntil: inDays(1) }, NOW)).toBeNull();
    expect(paid(-10)).toBeNull();
  });
});

describe("email templates", () => {
  it("escapes business-provided text in HTML", () => {
    const m = t.ownerClosureRequest({ name: `<script>x</script>`, joinCode: "B-ABC123", managerEmail: "m@x.in", reason: `"quit" & <b>bye</b>` });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("&quot;quit&quot; &amp; &lt;b&gt;bye&lt;/b&gt;");
    expect(m.text).toContain(`"quit" & <b>bye</b>`); // plain-text part is readable
  });

  it("puts the key facts and a link in every email", () => {
    const m = t.ownerPaymentToReview({ business: "Fresh", joinCode: "B-E2ZRFP", months: 12, amount: 4491, discountPct: 25, ref: "123456789012" });
    expect(m.subject).toContain("Fresh");
    expect(m.subject).toContain("4,491");
    expect(m.html).toContain("12 months (25% off)");
    // dashboard links go to the app host
    expect(m.html).toContain(`${APP_URL}/owner/payments`);
    expect(m.text).toContain("UPI reference: 123456789012");
  });

  it("words reminders by how much time is left", () => {
    const base = { business: "Fresh", kind: "ACTIVE" as const, monthlyPrice: 499, bestDiscount: 25, until: inDays(1) };
    expect(t.managerPlanReminder({ ...base, daysLeft: 1 }).subject).toContain("ends tomorrow");
    expect(t.managerPlanReminder({ ...base, daysLeft: 7 }).subject).toContain("in 7 days");
    expect(t.managerPlanReminder({ ...base, daysLeft: 0 }).subject).toContain("has ended");
    expect(t.managerPlanReminder({ ...base, kind: "TRIAL", daysLeft: 3 }).subject).toContain("free trial");
    expect(t.managerPlanReminder({ ...base, daysLeft: 3 }).html).toContain("up to <b>25%</b>");
  });
});
