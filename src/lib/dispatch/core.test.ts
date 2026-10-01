import { describe, expect, it } from "vitest";
import { chooseDriver, directionsUrl, distanceKm, orderStops, routeUrl, type DriverCandidate } from "./core";

const NOW = new Date("2026-10-01T10:00:00Z");
const fresh = new Date(NOW.getTime() - 5 * 60_000).toISOString();
const stale = new Date(NOW.getTime() - 3 * 3_600_000).toISOString();

// Delhi landmarks
const SAKET = { lat: 28.5245, lng: 77.2066 };
const HAUZ_KHAS = { lat: 28.5494, lng: 77.2001 };
const KAROL_BAGH = { lat: 28.6519, lng: 77.1909 };
const DWARKA = { lat: 28.5921, lng: 77.046 };

const driver = (over: Partial<DriverCandidate>): DriverCandidate => ({
  id: over.chatId ?? "x",
  chatId: "x",
  name: "D",
  status: "AVAILABLE",
  activeJobs: 0,
  maxJobs: 3,
  ...over,
});

describe("distanceKm", () => {
  it("is about right for Saket → Karol Bagh (~14 km)", () => {
    expect(distanceKm(SAKET, KAROL_BAGH)).toBeGreaterThan(13);
    expect(distanceKm(SAKET, KAROL_BAGH)).toBeLessThan(15);
  });
});

describe("chooseDriver", () => {
  const near = driver({ chatId: "near", name: "Near", location: HAUZ_KHAS, locationAt: fresh });
  const far = driver({ chatId: "far", name: "Far", location: DWARKA, locationAt: fresh });

  it("picks the nearest driver with a fresh location", () => {
    const c = chooseDriver(SAKET, [far, near], { now: NOW });
    expect(c?.driver.chatId).toBe("near");
    expect(c?.reason).toBe("nearest");
    expect(c?.distanceKm).toBeLessThan(5);
  });

  it("skips offline drivers, full drivers and drivers who declined", () => {
    expect(chooseDriver(SAKET, [{ ...near, status: "OFFLINE" }, far], { now: NOW })?.driver.chatId).toBe("far");
    expect(chooseDriver(SAKET, [{ ...near, activeJobs: 3 }, far], { now: NOW })?.driver.chatId).toBe("far");
    expect(chooseDriver(SAKET, [near, far], { now: NOW, exclude: ["near"] })?.driver.chatId).toBe("far");
  });

  it("ignores stale locations, falling back to the least busy driver", () => {
    const staleNear = { ...near, locationAt: stale, activeJobs: 2 };
    const idle = driver({ chatId: "idle", name: "Idle", activeJobs: 0 });
    expect(chooseDriver(SAKET, [staleNear, idle], { now: NOW })).toMatchObject({ driver: { chatId: "idle" }, reason: "least-busy" });
  });

  it("still prefers a located driver over an unlocated idle one", () => {
    const idle = driver({ chatId: "idle", name: "Idle" });
    expect(chooseDriver(SAKET, [idle, far], { now: NOW })?.driver.chatId).toBe("far");
  });

  it("returns null when nobody can take it", () => {
    expect(chooseDriver(SAKET, [{ ...near, status: "OFFLINE" }], { now: NOW })).toBeNull();
    expect(chooseDriver(SAKET, [], { now: NOW })).toBeNull();
  });
});

describe("routes", () => {
  it("visits the nearest remaining stop next", () => {
    const stops = [
      { id: "karol", point: KAROL_BAGH },
      { id: "hauz", point: HAUZ_KHAS },
      { id: "nowhere" },
    ];
    expect(orderStops(SAKET, stops).map((s) => s.id)).toEqual(["hauz", "karol", "nowhere"]);
  });

  it("builds a Google Maps route: driver → pickups → store", () => {
    const url = new URL(
      routeUrl({
        driver: SAKET,
        pickups: [
          { point: KAROL_BAGH, address: "Karol Bagh" },
          { point: HAUZ_KHAS, address: "Hauz Khas" },
        ],
        store: "Fresh Laundry, Lajpat Nagar, Delhi",
      })!,
    );
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("origin")).toBe("28.524500,77.206600");
    expect(url.searchParams.get("waypoints")).toBe("28.549400,77.200100|28.651900,77.190900");
    expect(url.searchParams.get("destination")).toBe("Fresh Laundry, Lajpat Nagar, Delhi");
    expect(url.searchParams.get("travelmode")).toBe("driving");
  });

  it("ends at the last pickup when no store is set, and uses addresses when not geocoded", () => {
    const url = new URL(routeUrl({ pickups: [{ address: "C-12, Saket, Delhi" }] })!);
    expect(url.searchParams.get("destination")).toBe("C-12, Saket, Delhi");
    expect(url.searchParams.has("origin")).toBe(false);
  });

  it("caps waypoints at Google's limit of 9", () => {
    const url = new URL(directionsUrl({ destination: SAKET, waypoints: Array.from({ length: 12 }, () => HAUZ_KHAS) }));
    expect(url.searchParams.get("waypoints")!.split("|")).toHaveLength(9);
  });
});
