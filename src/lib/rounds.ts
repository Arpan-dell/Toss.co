// Pickups without a basket, and hostel/PG collection rounds: the small rules, kept pure so they're tested
// (see bookings.ts for the database side).

/**
 * Pickups without a Toss basket still need a basket row (orders are keyed by basket): a "virtual basket".
 * web-<laundry>-<customer code> for a customer who books online, tel-<laundry>-<phone> for one the laundry books by
 * phone, and rnd-<account> for a hostel/PG's collection round (one stop, the hostel's address).
 */
export const isVirtualDevice = (deviceId: string) => /^(web|tel|rnd)-/.test(deviceId);

/** Only the real, physical baskets (for counts, online status and the Fleet list). */
export const realBaskets = <T extends { deviceId: string }>(devices: T[]): T[] => devices.filter((d) => !isVirtualDevice(d.deviceId));

const code = (s: string, n: number) => s.replace(/[^A-Za-z0-9]/g, "").slice(0, n);
export const webDeviceId = (tenantId: string, customerCode: string) => `web-${code(tenantId, 20)}-${code(customerCode, 30)}`;
export const phoneDeviceId = (tenantId: string, e164: string) => `tel-${code(tenantId, 20)}-${e164.replace(/\D/g, "").slice(-15)}`;
export const roundDeviceId = (accountId: string) => `rnd-${code(accountId, 40)}`;

/** A booking is given to a driver this long before its time slot (so they arrive on time). */
export const DISPATCH_LEAD_MS = 30 * 60_000;
/** Bookings can be made this far ahead. */
export const MAX_AHEAD_MS = 7 * 86_400_000;

/** The offset of a time zone from UTC at a moment, in milliseconds (e.g. +5:30 for India). */
function zoneOffset(at: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(at))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** A wall-clock date and time in a time zone ("2026-10-24", "10:00", "Asia/Kolkata") as a UTC instant. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const first = guess - zoneOffset(guess, timeZone);
  // once more, in case the first guess crossed a daylight-saving change
  return new Date(guess - zoneOffset(first, timeZone));
}

/** The calendar date ("2026-10-24") of an instant in a time zone. */
export function zonedDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

const addDays = (date: string, days: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** The next round at `time` (local), at least `afterMs` from now: today if it's still ahead, else the next day. */
export function firstRoundAt(time: string, timeZone: string, now: Date, afterMs = 0): Date {
  let date = zonedDate(now, timeZone);
  for (let i = 0; i < 3; i++) {
    const at = zonedToUtc(date, time, timeZone);
    if (at.getTime() > now.getTime() + afterMs) return at;
    date = addDays(date, 1);
  }
  return zonedToUtc(date, time, timeZone);
}

/** The round after `previous`, every `everyDays` days at the same local time, moved past `now` if rounds were missed. */
export function nextRoundAt(previous: Date, everyDays: number, time: string, timeZone: string, now: Date): Date {
  let date = zonedDate(previous, timeZone);
  let at = zonedToUtc(addDays(date, everyDays), time, timeZone);
  for (let i = 0; i < 400 && at.getTime() <= now.getTime(); i++) {
    date = addDays(date, everyDays);
    at = zonedToUtc(addDays(date, everyDays), time, timeZone);
  }
  return at;
}

/** Residents can say "I have clothes this time" until this long before the round. */
export const roundOpen = (roundAt: Date, cutoffMinutes: number, now: Date) => now.getTime() < roundAt.getTime() - cutoffMinutes * 60_000;

/** Whether a pickup should be given to a driver now (no time slot, or the slot is coming up). */
export const isDue = (pickupAfter: string | null | undefined, now: Date) => !pickupAfter || new Date(pickupAfter).getTime() - DISPATCH_LEAD_MS <= now.getTime();

/** A requested slot: "now", or a local date-time from the form ("2026-10-24T10:00"), checked to be ahead and within a week. */
export function parseSlot(value: string, timeZone: string, now: Date): { at: Date | null } | { error: string } {
  if (!value || value === "now") return { at: null };
  const m = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
  if (!m) return { error: "Choose a pickup time." };
  const at = zonedToUtc(m[1], m[2], timeZone);
  if (at.getTime() < now.getTime() - 5 * 60_000) return { error: "That time has already passed. Choose a later one." };
  if (at.getTime() > now.getTime() + MAX_AHEAD_MS) return { error: "Pickups can be booked up to 7 days ahead." };
  return { at: at.getTime() - now.getTime() < DISPATCH_LEAD_MS ? null : at };
}

// ---------- combining hostel rounds that are due together into one trip ----------

/** Bags one driver collects on a combined round trip (the most a driver can carry at once, as on Fleet). */
export const TRIP_MAX_BAGS = 20;

type RoundStop = { id: string; bags: number; point?: { lat: number; lng: number } };

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
};

/**
 * Hostels whose rounds are due at the same time, packed into as few trips as fit: start with the hostel with the
 * most bags, then go to the nearest next one while the bags still fit. A hostel with more bags than a trip holds
 * gets its own trip. Returns the trips as hostel ids in visiting order.
 */
export function planRoundTrips(stops: RoundStop[], maxBags = TRIP_MAX_BAGS): string[][] {
  const left = [...stops].sort((a, b) => b.bags - a.bags);
  const trips: string[][] = [];
  while (left.length) {
    let here = left.shift()!;
    const trip = [here.id];
    let bags = here.bags;
    for (;;) {
      const fits = left.filter((s) => bags + s.bags <= maxBags);
      if (!fits.length) break;
      // nearest next hostel (one without a location goes last)
      const next = fits.sort((a, b) => (here.point && a.point ? km(here.point, a.point) : 1e9) - (here.point && b.point ? km(here.point, b.point) : 1e9))[0];
      left.splice(left.indexOf(next), 1);
      trip.push(next.id);
      bags += next.bags;
      here = next;
    }
    trips.push(trip);
  }
  return trips;
}
