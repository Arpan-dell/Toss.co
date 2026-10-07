// Driver pay from completed pickups: the laundry's rate per pickup, plus per km from the store to the basket
// when both are on the map. Pure, shared by the manager's Driver pay page and the driver bot's "My earnings".
import { distanceKm, type LatLng } from "./dispatch/core";
import { driverPay } from "./profit";

export type PayRates = { driverPayPerPickup: number; driverPayPerKm: number };
export type Earnings = { pickups: number; km: number; pay: number };

export function earnings(
  pickups: { deviceId: string }[],
  rates: PayRates,
  store: LatLng | null,
  basketAt: (deviceId: string) => LatLng | undefined,
): Earnings {
  let km = 0;
  let pay = 0;
  for (const p of pickups) {
    const at = basketAt(p.deviceId);
    const d = store && at ? distanceKm(store, at) : 0;
    km += d;
    pay += driverPay(rates, d);
  }
  return { pickups: pickups.length, km: Math.round(km * 10) / 10, pay: Math.round(pay) };
}

/** Monday 00:00 IST of the week containing `now`, as an ISO string (weeks run Monday to Sunday). */
export function weekStartIST(now: Date, weeksBack = 0): string {
  const IST = 330 * 60_000;
  const local = new Date(now.getTime() + IST);
  const day = (local.getUTCDay() + 6) % 7; // Monday = 0
  const monday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - day - 7 * weeksBack);
  return new Date(monday - IST).toISOString();
}

/** The 1st of the month (IST) containing `now`. */
export function monthStartIST(now: Date): string {
  const IST = 330 * 60_000;
  const local = new Date(now.getTime() + IST);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - IST).toISOString();
}
