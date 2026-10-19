// The distance a driver covered doing their jobs: from where they were when given the day's first job, stop to
// stop through every pickup, the store and every delivery, in the order they were done. Turns taken in between
// (a detour, a tea break, going home) don't count: only the legs between job points do.
//
// Legs are straight lines between points times ROAD_FACTOR, the usual ratio of road distance to straight-line
// distance in cities (≈1.3). Good enough to compare drivers and pay per km without a paid routing service.
import { distanceKm, type LatLng } from "./dispatch/core";

export const ROAD_FACTOR = 1.3;

export type JobEvent = {
  kind: "pickup" | "delivery";
  at: string; // when it was done (picked up / delivered)
  point?: LatLng; // the customer's basket
  start?: LatLng; // where the driver was when given this job
};

const leg = (a?: LatLng, b?: LatLng) => (a && b ? distanceKm(a, b) * ROAD_FACTOR : 0);

/**
 * One driver's jobs on one day → kilometres. Pickups are dropped at the store and deliveries collected there,
 * so going from a pickup to a delivery passes through the store, and a day that ends with pickups ends at the store.
 */
export function dayKm(events: JobEvent[], store?: LatLng): number {
  const done = [...events].sort((a, b) => a.at.localeCompare(b.at));
  if (!done.length) return 0;
  const first = done[0];
  // start: where they were when given the first job; otherwise the store (a delivery always starts there)
  let here: LatLng | undefined = first.kind === "delivery" ? (store ?? first.start) : (first.start ?? store);
  let km = 0;
  let carrying = false; // clothes picked up and not yet dropped at the store
  for (const e of done) {
    // a delivery after pickups: drop those at the store and collect the clean clothes there first
    if (e.kind === "delivery" && carrying) {
      km += leg(here, store);
      here = store;
      carrying = false;
    }
    km += leg(here, e.point);
    here = e.point ?? here;
    if (e.kind === "pickup") carrying = true;
  }
  if (carrying) km += leg(here, store);
  return Math.round(km * 10) / 10;
}

/** Group a driver's jobs by day (in the business's time zone) and add up each day's route. */
export function routeKm(events: JobEvent[], store: LatLng | undefined, timezone: string): number {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  const byDay = new Map<string, JobEvent[]>();
  for (const e of events) {
    const k = day.format(new Date(e.at));
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  let km = 0;
  for (const list of byDay.values()) km += dayKm(list, store);
  return Math.round(km * 10) / 10;
}

/** Midnight at the start of `now`'s day in a time zone, as an ISO string. */
export function startOfDay(now: Date, timezone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  const sinceMidnight = (Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000;
  return new Date(Math.floor((now.getTime() - sinceMidnight) / 1000) * 1000).toISOString();
}
