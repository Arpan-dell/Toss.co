import { describe, expect, it } from "vitest";
import { distanceKm } from "./dispatch/core";
import { ROAD_FACTOR, dayKm, routeKm } from "./route-distance";

const store = { lat: 28.6, lng: 77.2 };
const a = { lat: 28.61, lng: 77.2 }; // ~1.1 km north of the store
const b = { lat: 28.62, lng: 77.2 }; // ~2.2 km north
const home = { lat: 28.63, lng: 77.2 }; // where the driver started (~3.3 km north)
const km = (p: { lat: number; lng: number }, q: { lat: number; lng: number }) => distanceKm(p, q) * ROAD_FACTOR;
const r1 = (n: number) => Math.round(n * 10) / 10;

describe("distance a driver covered", () => {
  it("counts from where they were given the first job, stop to stop, ending at the store", () => {
    const day = [
      { kind: "pickup" as const, at: "2026-10-19T05:00:00Z", point: b, start: home },
      { kind: "pickup" as const, at: "2026-10-19T05:30:00Z", point: a },
    ];
    expect(dayKm(day, store)).toBe(r1(km(home, b) + km(b, a) + km(a, store)));
  });
  it("goes through the store between pickups and deliveries", () => {
    const day = [
      { kind: "pickup" as const, at: "2026-10-19T05:00:00Z", point: a, start: store },
      { kind: "delivery" as const, at: "2026-10-19T06:00:00Z", point: b },
    ];
    expect(dayKm(day, store)).toBe(r1(km(store, a) + km(a, store) + km(store, b)));
  });
  it("starts a delivery-only day at the store", () => {
    expect(dayKm([{ kind: "delivery", at: "2026-10-19T06:00:00Z", point: b }], store)).toBe(r1(km(store, b)));
  });
  it("adds up separate days (no leg from last night's stop to this morning's)", () => {
    const events = [
      { kind: "pickup" as const, at: "2026-10-18T06:00:00Z", point: a, start: store },
      { kind: "pickup" as const, at: "2026-10-19T06:00:00Z", point: a, start: store },
    ];
    expect(routeKm(events, store, "Asia/Kolkata")).toBe(r1(2 * r1(km(store, a) * 2)));
  });
});

describe("start of the day", () => {
  it("is midnight in the business's time zone", async () => {
    const { startOfDay } = await import("./route-distance");
    expect(startOfDay(new Date("2026-10-19T08:35:00Z"), "Asia/Kolkata")).toBe("2026-10-18T18:30:00.000Z");
    expect(startOfDay(new Date("2026-10-19T08:35:00Z"), "America/New_York")).toBe("2026-10-19T04:00:00.000Z");
  });
});
