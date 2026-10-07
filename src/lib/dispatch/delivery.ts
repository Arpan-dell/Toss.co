// Pure delivery logic (migration 0027): status labels, the customer's handover code, and a driver's route that
// mixes pickups and deliveries. No I/O here; it's unit-tested.
import { directionsUrl, orderStops, routeUrl, type LatLng, type Place } from "./core";

export type DeliveryStatus = "WAITING" | "ASSIGNED" | "OUT" | "DELIVERED" | "COLLECTED";

/** Still on its way back to the customer (shown on boards and the customer's home). */
export const OPEN_DELIVERY: DeliveryStatus[] = ["WAITING", "ASSIGNED", "OUT"];

export const DELIVERY_LABEL: Record<DeliveryStatus, string> = {
  WAITING: "Ready, waiting for a driver",
  ASSIGNED: "Driver collecting it from the store",
  OUT: "Out for delivery",
  DELIVERED: "Delivered",
  COLLECTED: "Collected from the store",
};

/** A 4-digit handover code from a random integer 0-9999 (the server passes crypto.randomInt(10000)). */
export const deliveryCode = (n: number) => String(Math.abs(Math.trunc(n)) % 10_000).padStart(4, "0");

/** What the driver typed matches the customer's code. Spaces and dashes are ignored ("48 21", "48-21"). */
export function codeMatches(typed: string, code: string | null | undefined): boolean {
  if (!code) return false;
  const digits = typed.replace(/[\s-]/g, "");
  return /^\d{4}$/.test(digits) && digits === code;
}

/** Looks like a handover code attempt (4 digits), as opposed to a menu button or chat. */
export const looksLikeCode = (typed: string) => /^\d{4}$/.test(typed.replace(/[\s-]/g, ""));

type Stop = { point?: LatLng; address: string };

/**
 * A driver's whole trip as one Google Maps link:
 *   pickups (nearest first) → the store (to drop pickups and/or collect deliveries) → deliveries (nearest first).
 * Without deliveries it's the usual pickup route ending at the store. `collectFirst`: some delivery still has to be
 * collected from the store, so the route goes through the store even with no pickups.
 */
export function tripRouteUrl(o: { driver?: LatLng; pickups: Stop[]; deliveries: Stop[]; collectFirst: boolean; store?: Place }): string | null {
  if (!o.deliveries.length) return o.pickups.length ? routeUrl({ driver: o.driver, pickups: o.pickups, store: o.store }) : null;
  const pickups = orderStops(o.driver, o.pickups);
  const viaStore = !!o.store && (pickups.length > 0 || o.collectFirst);
  const storePoint = o.store && typeof o.store !== "string" ? o.store : undefined;
  const lastPickup = pickups.length ? pickups[pickups.length - 1].point : undefined;
  const from = viaStore ? (storePoint ?? lastPickup) : (lastPickup ?? o.driver);
  const drops = orderStops(from, o.deliveries);
  const seq: Place[] = [...pickups.map((p) => p.point ?? p.address), ...(viaStore ? [o.store!] : []), ...drops.map((d) => d.point ?? d.address)];
  const destination = seq.pop()!;
  return directionsUrl({ origin: o.driver, destination, waypoints: seq });
}
