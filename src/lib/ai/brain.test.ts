import { describe, expect, it } from "vitest";
import { modelSafeCandidate } from "./brain";
import type { Candidate } from "./engine";

const base = { id: "x1", reason: "Peak day needs more pickups.", impact: "", priority: 2 as const, target: "t" };

describe("modelSafeCandidate (what Gemini may see)", () => {
  it("drops driver names and internal IDs, and rewrites the label", () => {
    const c = { ...base, type: "set_max_jobs", label: "Let Aviraj carry 3 pickups at once (now 2)", params: { driverId: "uuid-1", driverName: "Aviraj", from: 2, to: 3 } } as Candidate;
    const safe = modelSafeCandidate(c);
    expect(JSON.stringify(safe)).not.toMatch(/Aviraj|uuid-1/);
    expect(safe.params).toEqual({ from: 2, to: 3 });
    expect(safe.summary).toBe("Let a driver carry 3 pickups at once (now 2)");
  });

  it("keeps customer codes but not customer, order or device IDs", () => {
    const c = { ...base, type: "winback_offer", label: "Offer C-AB12CD 10% off their next pickup", params: { customerId: "uuid-2", customerCode: "C-AB12CD", pct: 10, orderId: "o1", deviceId: "AA:BB" } } as Candidate;
    const safe = modelSafeCandidate(c);
    expect(safe.params).toEqual({ customerCode: "C-AB12CD", pct: 10 });
  });
});
