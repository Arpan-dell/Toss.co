import { describe, expect, it } from "vitest";
import { earnings, monthStartIST, weekStartIST } from "./driver-pay";

describe("earnings", () => {
  it("pays per pickup plus per km from the store when the basket is on the map", () => {
    const store = { lat: 28.5245, lng: 77.2066 }; // Saket
    const near = { lat: 28.5335, lng: 77.2066 }; // ~1 km north
    const e = earnings([{ deviceId: "a" }, { deviceId: "b" }], { driverPayPerPickup: 20, driverPayPerKm: 5 }, store, (id) => (id === "a" ? near : undefined));
    expect(e.pickups).toBe(2);
    expect(e.km).toBeCloseTo(1, 1);
    expect(e.pay).toBe(45); // 20 + ~5 for the mapped one, 20 for the other
  });
  it("is just per pickup without a store location", () => {
    expect(earnings([{ deviceId: "a" }], { driverPayPerPickup: 25, driverPayPerKm: 9 }, null, () => undefined)).toEqual({ pickups: 1, km: 0, pay: 25 });
  });
});

describe("week and month starts (IST)", () => {
  it("start on Monday 00:00 IST", () => {
    // Wednesday 8 Oct 2026, 12:00 UTC -> Monday 5 Oct 00:00 IST = 4 Oct 18:30 UTC
    expect(weekStartIST(new Date("2026-10-08T12:00:00Z"))).toBe("2026-10-04T18:30:00.000Z");
    expect(weekStartIST(new Date("2026-10-08T12:00:00Z"), 1)).toBe("2026-09-27T18:30:00.000Z");
    // Sunday late night IST still belongs to that week
    expect(weekStartIST(new Date("2026-10-11T18:00:00Z"))).toBe("2026-10-04T18:30:00.000Z");
    expect(monthStartIST(new Date("2026-10-08T12:00:00Z"))).toBe("2026-09-30T18:30:00.000Z");
  });
});
