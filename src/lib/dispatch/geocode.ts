import "server-only";
import type { LatLng } from "./core";
import { cached } from "../cache";

// Address → coordinates with OpenStreetMap's free Nominatim service (no key, no cost).
// Usage policy: identify the app, at most ~1 request/second, cache results. We geocode once per
// address and store it on the basket/business, so volume stays tiny.
// https://operations.osmfoundation.org/policies/nominatim/

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Toss-laundry/1.0 (https://tosslaundry.online)";

async function query(q: string, country: string): Promise<LatLng | null> {
  // searched within the business's country (India unless told otherwise), so a street name can't land abroad
  const params: Record<string, string> = { q, format: "jsonv2", limit: "1" };
  if (/^[a-z]{2}$/i.test(country)) params.countrycodes = country.toLowerCase();
  const url = `${ENDPOINT}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT, "accept-language": "en" }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const [hit] = (await res.json()) as { lat: string; lon: string }[];
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
}

/**
 * Indian street addresses ("C-12, Saket, New Delhi") often aren't in OpenStreetMap down to the
 * house, so retry with the most specific parts dropped one by one. Ending at the locality or city is
 * still good enough to choose the nearest driver and to open turn-by-turn navigation.
 */
export async function geocode(address: string, country = "IN"): Promise<LatLng | null> {
  // Places don't move: a found address is cached for a week (also keeps us well inside Nominatim's limit).
  const key = `geo:${country.toLowerCase()}:${address.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200)}`;
  try {
    return await cached(key, 7 * 24 * 3600, async () => {
      const hit = await lookup(address, country);
      if (!hit) throw new Error("not found"); // thrown, so a miss is retried next time instead of cached
      return hit;
    });
  } catch {
    return null;
  }
}

async function lookup(address: string, country: string): Promise<LatLng | null> {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  const tries = parts.map((_, i) => parts.slice(i).join(", "));
  // "John Smith 1600 Pennsylvania Ave NW, …": a name before the house number stops the match, so also try
  // from the first number on, right after the full address
  const fromNumber = address.slice(address.search(/\d/)).trim();
  if (/\d/.test(address) && fromNumber !== address.trim()) tries.splice(1, 0, fromNumber);
  for (const q of tries) {
    try {
      const hit = await query(q, country);
      if (hit) return hit;
    } catch {
      return null; // network error or timeout: try again next time this address is needed
    }
    await new Promise((r) => setTimeout(r, 1100)); // stay under Nominatim's 1 request/second
  }
  return null;
}
