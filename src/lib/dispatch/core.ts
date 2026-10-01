// Pure dispatch logic: who gets a new pickup, in which order a driver visits stops, and the
// Google Maps links that show it. No I/O here; it's unit-tested.

export interface LatLng {
  lat: number;
  lng: number;
}

export interface DriverCandidate {
  id: string;
  chatId: string;
  name: string;
  status: "AVAILABLE" | "ON_JOB" | "OFFLINE";
  location?: LatLng;
  locationAt?: string;
  activeJobs: number;
  maxJobs: number;
}

/** A live location older than this no longer tells us where the driver is. */
export const LOCATION_FRESH_MS = 30 * 60_000;

export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type DriverChoice = { driver: DriverCandidate; distanceKm?: number; reason: "nearest" | "least-busy" } | null;

/**
 * Picks the driver for a pickup:
 *  1. only drivers who are online (not OFFLINE), under their job limit, and haven't declined it;
 *  2. among those with a fresh live location, the nearest to the pickup;
 *  3. if nobody has a fresh location (or the pickup has no coordinates), the least busy one.
 */
export function chooseDriver(
  pickup: LatLng | undefined,
  drivers: DriverCandidate[],
  opts: { now?: Date; exclude?: string[] } = {},
): DriverChoice {
  const now = (opts.now ?? new Date()).getTime();
  const exclude = new Set(opts.exclude ?? []);
  const eligible = drivers.filter((d) => d.status !== "OFFLINE" && d.activeJobs < d.maxJobs && !exclude.has(d.chatId));
  if (!eligible.length) return null;

  const fresh = (d: DriverCandidate) => !!d.location && !!d.locationAt && now - new Date(d.locationAt).getTime() <= LOCATION_FRESH_MS;
  if (pickup) {
    const located = eligible
      .filter(fresh)
      .map((d) => ({ driver: d, km: distanceKm(d.location!, pickup) }))
      // Nearest first; on a tie, the driver with fewer jobs.
      .sort((a, b) => a.km - b.km || a.driver.activeJobs - b.driver.activeJobs);
    if (located.length) return { driver: located[0].driver, distanceKm: located[0].km, reason: "nearest" };
  }
  const leastBusy = [...eligible].sort((a, b) => a.activeJobs - b.activeJobs || a.name.localeCompare(b.name))[0];
  return { driver: leastBusy, reason: "least-busy" };
}

/** Orders pickups so each next stop is the nearest remaining one (good enough for a few stops). */
export function orderStops<T extends { point?: LatLng }>(start: LatLng | undefined, stops: T[]): T[] {
  const withPoint = stops.filter((s) => s.point);
  const without = stops.filter((s) => !s.point);
  if (!start) return [...withPoint, ...without];
  const remaining = [...withPoint];
  const ordered: T[] = [];
  let here = start;
  while (remaining.length) {
    let best = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (distanceKm(here, remaining[i].point!) < distanceKm(here, remaining[best].point!)) best = i;
    }
    const [next] = remaining.splice(best, 1);
    ordered.push(next);
    here = next.point!;
  }
  return [...ordered, ...without];
}

const fmt = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
type Place = LatLng | string; // coordinates, or an address Google can search

const place = (p: Place) => (typeof p === "string" ? p : fmt(p));

// Google Maps directions link (no API key): https://developers.google.com/maps/documentation/urls/get-started
// Google Maps supports at most 9 waypoints in a link.
export const MAX_WAYPOINTS = 9;

export function directionsUrl(opts: { origin?: Place; destination: Place; waypoints?: Place[] }): string {
  const params = new URLSearchParams({ api: "1", destination: place(opts.destination), travelmode: "driving" });
  if (opts.origin) params.set("origin", place(opts.origin));
  const wp = (opts.waypoints ?? []).slice(0, MAX_WAYPOINTS);
  if (wp.length) params.set("waypoints", wp.map(place).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function searchUrl(p: Place): string {
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: place(p) }).toString()}`;
}

/**
 * The driver's full route: from where they are, through every open pickup (nearest-first),
 * ending at the laundry store. Without a store, the last pickup is the destination.
 */
export function routeUrl(opts: {
  driver?: LatLng;
  pickups: { point?: LatLng; address: string }[];
  store?: Place;
}): string | null {
  const ordered = orderStops(opts.driver, opts.pickups).map((p) => p.point ?? p.address);
  if (!ordered.length && !opts.store) return null;
  if (!opts.store) {
    return directionsUrl({ origin: opts.driver, destination: ordered[ordered.length - 1], waypoints: ordered.slice(0, -1) });
  }
  return directionsUrl({ origin: opts.driver, destination: opts.store, waypoints: ordered });
}
