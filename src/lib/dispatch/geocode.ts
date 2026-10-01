import "server-only";
import type { LatLng } from "./core";

// Address → coordinates with OpenStreetMap's free Nominatim service (no key, no cost).
// Usage policy: identify the app, at most ~1 request/second, cache results. We geocode once per
// address and store it on the basket/business, so volume stays tiny.
// https://operations.osmfoundation.org/policies/nominatim/

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Toss-laundry/1.0 (https://toss-code-x-a24a.vercel.app)";

async function query(q: string): Promise<LatLng | null> {
  const url = `${ENDPOINT}?${new URLSearchParams({ q, format: "jsonv2", limit: "1", countrycodes: "in" })}`;
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
export async function geocode(address: string): Promise<LatLng | null> {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    try {
      const hit = await query(parts.slice(i).join(", "));
      if (hit) return hit;
    } catch {
      return null; // network error or timeout: try again next time this address is needed
    }
    await new Promise((r) => setTimeout(r, 1100)); // stay under Nominatim's 1 request/second
  }
  return null;
}
