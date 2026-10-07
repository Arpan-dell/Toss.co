import { describe, expect, it } from "vitest";
import { codeMatches, deliveryCode, looksLikeCode, tripRouteUrl } from "./delivery";

const params = (url: string | null) => new URL(url!).searchParams;

describe("handover code", () => {
  it("is always 4 digits", () => {
    expect(deliveryCode(7)).toBe("0007");
    expect(deliveryCode(4821)).toBe("4821");
    expect(deliveryCode(19999)).toBe("9999");
  });

  it("matches what the driver typed, ignoring spaces and dashes", () => {
    expect(codeMatches("4821", "4821")).toBe(true);
    expect(codeMatches("48 21", "4821")).toBe(true);
    expect(codeMatches("48-21", "4821")).toBe(true);
    expect(codeMatches("4812", "4821")).toBe(false);
    expect(codeMatches("482", "4821")).toBe(false);
    expect(codeMatches("4821", null)).toBe(false);
  });

  it("tells a code attempt from other messages", () => {
    expect(looksLikeCode("0042")).toBe(true);
    expect(looksLikeCode("6.4")).toBe(false);
    expect(looksLikeCode("📋 My jobs")).toBe(false);
  });
});

describe("tripRouteUrl", () => {
  const store = { lat: 28.6, lng: 77.2 };
  const driver = { lat: 28.5, lng: 77.1 };
  const near = { point: { lat: 28.51, lng: 77.11 }, address: "near driver" };
  const far = { point: { lat: 28.7, lng: 77.3 }, address: "far" };
  const nearStore = { point: { lat: 28.61, lng: 77.21 }, address: "near store" };

  it("is the usual pickup route without deliveries, and nothing with no stops", () => {
    expect(params(tripRouteUrl({ driver, pickups: [near], deliveries: [], collectFirst: false, store })).get("destination")).toBe("28.600000,77.200000");
    expect(tripRouteUrl({ driver, pickups: [], deliveries: [], collectFirst: false, store })).toBeNull();
  });

  it("goes pickups → store → deliveries (nearest first from the store)", () => {
    const p = params(tripRouteUrl({ driver, pickups: [near], deliveries: [far, nearStore], collectFirst: true, store }));
    expect(p.get("waypoints")).toBe("28.510000,77.110000|28.600000,77.200000|28.610000,77.210000");
    expect(p.get("destination")).toBe("28.700000,77.300000");
  });

  it("collects from the store first when the bags are still there", () => {
    const p = params(tripRouteUrl({ driver, pickups: [], deliveries: [far], collectFirst: true, store }));
    expect(p.get("waypoints")).toBe("28.600000,77.200000");
    expect(p.get("destination")).toBe("28.700000,77.300000");
  });

  it("goes straight to the customer once the bags are on board", () => {
    const p = params(tripRouteUrl({ driver, pickups: [], deliveries: [far], collectFirst: false, store }));
    expect(p.get("waypoints")).toBeNull();
    expect(p.get("destination")).toBe("28.700000,77.300000");
  });
});
