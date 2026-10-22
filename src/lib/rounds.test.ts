import { describe, expect, it } from "vitest";
import { firstRoundAt, isDue, isVirtualDevice, nextRoundAt, parseSlot, phoneDeviceId, planRoundTrips, realBaskets, roundDeviceId, roundOpen, webDeviceId, zonedToUtc } from "./rounds";

const IST = "Asia/Kolkata";

describe("virtual baskets", () => {
  it("names and recognises them", () => {
    expect(webDeviceId("B-E2ZRFP", "C-7KD2M")).toBe("web-BE2ZRFP-C7KD2M");
    expect(phoneDeviceId("B-E2ZRFP", "+919876543210")).toBe("tel-BE2ZRFP-919876543210");
    expect(roundDeviceId("A-HOSTEL1")).toBe("rnd-AHOSTEL1");
    expect(isVirtualDevice("web-BE2ZRFP-C7KD2M")).toBe(true);
    expect(isVirtualDevice("tel-BE2ZRFP-919876543210")).toBe(true);
    expect(isVirtualDevice("rnd-AHOSTEL1")).toBe(true);
    expect(isVirtualDevice("A4:CF:12:9B:00:11")).toBe(false);
    expect(isVirtualDevice("legacy-1000000001")).toBe(false);
    expect(realBaskets([{ deviceId: "web-X" }, { deviceId: "A4:CF" }])).toEqual([{ deviceId: "A4:CF" }]);
  });
});

describe("times in the laundry's time zone", () => {
  it("turns local wall-clock time into UTC", () => {
    expect(zonedToUtc("2026-10-24", "10:00", IST).toISOString()).toBe("2026-10-24T04:30:00.000Z");
    expect(zonedToUtc("2026-07-01", "09:00", "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z"); // summer time
    expect(zonedToUtc("2026-12-01", "09:00", "America/New_York").toISOString()).toBe("2026-12-01T14:00:00.000Z");
  });

  it("finds the first round: today if still ahead, otherwise tomorrow", () => {
    const morning = new Date("2026-10-24T02:00:00Z"); // 7:30 am IST
    expect(firstRoundAt("10:00", IST, morning).toISOString()).toBe("2026-10-24T04:30:00.000Z");
    const noon = new Date("2026-10-24T06:30:00Z"); // 12:00 IST
    expect(firstRoundAt("10:00", IST, noon).toISOString()).toBe("2026-10-25T04:30:00.000Z");
  });

  it("moves rounds on every N days, skipping missed ones", () => {
    const prev = new Date("2026-10-24T04:30:00Z");
    expect(nextRoundAt(prev, 2, "10:00", IST, new Date("2026-10-24T05:00:00Z")).toISOString()).toBe("2026-10-26T04:30:00.000Z");
    // the job didn't run for a week: the next round is the first one still ahead
    expect(nextRoundAt(prev, 2, "10:00", IST, new Date("2026-10-31T00:00:00Z")).toISOString()).toBe("2026-11-01T04:30:00.000Z");
  });

  it("closes sign-ups before the round and gives pickups to a driver shortly before their slot", () => {
    const round = new Date("2026-10-24T04:30:00Z");
    expect(roundOpen(round, 60, new Date("2026-10-24T03:00:00Z"))).toBe(true);
    expect(roundOpen(round, 60, new Date("2026-10-24T03:45:00Z"))).toBe(false);
    expect(isDue(null, round)).toBe(true);
    expect(isDue(round.toISOString(), new Date("2026-10-24T03:30:00Z"))).toBe(false);
    expect(isDue(round.toISOString(), new Date("2026-10-24T04:05:00Z"))).toBe(true);
  });

  it("checks a requested slot", () => {
    const now = new Date("2026-10-24T04:30:00Z"); // 10:00 IST
    expect(parseSlot("now", IST, now)).toEqual({ at: null });
    expect(parseSlot("2026-10-24T10:10", IST, now)).toEqual({ at: null }); // within half an hour: as soon as possible
    expect(parseSlot("2026-10-24T15:00", IST, now)).toEqual({ at: new Date("2026-10-24T09:30:00Z") });
    expect(parseSlot("2026-10-23T15:00", IST, now)).toHaveProperty("error");
    expect(parseSlot("2026-11-05T15:00", IST, now)).toHaveProperty("error");
    expect(parseSlot("tomorrow", IST, now)).toHaveProperty("error");
  });
});

describe("combining hostel rounds into trips", () => {
  const A = { lat: 28.52, lng: 77.2 }, B = { lat: 28.53, lng: 77.21 }, C = { lat: 28.7, lng: 77.1 };

  it("puts small rounds due together on one trip, nearest next", () => {
    expect(planRoundTrips([{ id: "far", bags: 2, point: C }, { id: "pg1", bags: 5, point: A }, { id: "pg2", bags: 3, point: B }])).toEqual([["pg1", "pg2", "far"]]);
  });

  it("starts a new trip when the bags don't fit", () => {
    expect(planRoundTrips([{ id: "pg1", bags: 14, point: A }, { id: "pg2", bags: 9, point: B }, { id: "pg3", bags: 4, point: C }], 20)).toEqual([["pg1", "pg3"], ["pg2"]]);
  });

  it("gives a big hostel its own trip", () => {
    expect(planRoundTrips([{ id: "big", bags: 30 }, { id: "small", bags: 2 }], 20)).toEqual([["big"], ["small"]]);
  });
});
