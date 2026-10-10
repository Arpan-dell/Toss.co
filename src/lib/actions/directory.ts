"use server";

import { revalidatePath } from "next/cache";
import { geocode } from "../dispatch/geocode";
import { getSession } from "../session";
import { createClient } from "../supabase/server";
import { friendlyError, text, type FormState } from "./shared";
import { allow, clientIp } from "../rate-limit";
import { cached } from "../cache";

// The public "Find a laundry" directory: anyone can search, signed-in customers can connect.

export type Laundry = {
  code: string;
  name: string;
  pricePerKg: number;
  address?: string;
  distanceKm: number;
  radiusKm: number;
  driversReady: number;
  pickups30d: number;
  avgAcceptMins?: number;
  customers: number;
  since: string;
  lat: number;
  lng: number;
};

const validPoint = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** Businesses whose service area covers this point, nearest first. */
export async function findLaundries(lat: number, lng: number): Promise<{ laundries?: Laundry[]; error?: string }> {
  if (!validPoint(lat, lng)) return { error: "That location doesn't look right. Try again." };
  if (!(await allow("directoryIp", await clientIp()))) return { error: "Too many attempts. Wait a minute and try again." };
  // the same spot gives everyone the same list: cache it per ~100 m for 2 minutes (errors aren't cached)
  const key = `laundries:${lat.toFixed(3)},${lng.toFixed(3)}`;
  let rows: Record<string, unknown>[];
  try {
    rows = await cached(key, 120, async () => {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("nearby_businesses", { p_lat: Number(lat.toFixed(3)), p_lng: Number(lng.toFixed(3)) });
      if (error) throw error;
      return data as Record<string, unknown>[];
    });
  } catch (error) {
    return { error: friendlyError(error as { message: string }) };
  }
  return {
    laundries: rows.map((r) => ({
      code: r.join_code as string,
      name: r.name as string,
      pricePerKg: r.price_per_kg as number,
      address: (r.store_address as string | null) ?? undefined,
      distanceKm: r.distance_km as number,
      radiusKm: r.radius_km as number,
      driversReady: r.drivers_ready as number,
      pickups30d: r.pickups_30d as number,
      avgAcceptMins: (r.avg_accept_mins as number | null) ?? undefined,
      customers: r.customers as number,
      since: r.since as string,
      lat: r.lat as number,
      lng: r.lng as number,
    })),
  };
}

/** A typed area or address → coordinates (OpenStreetMap, India). */
export async function locatePlace(query: string): Promise<{ lat?: number; lng?: number; error?: string }> {
  const q = query.trim().slice(0, 200);
  if (q.length < 3) return { error: "Type your area or address, like Saket, New Delhi." };
  if (!(await allow("geocodeIp", await clientIp()))) return { error: "Too many attempts. Wait a minute and try again." };
  const hit = await geocode(q);
  return hit ? { lat: hit.lat, lng: hit.lng } : { error: "We couldn't find that place. Try your area and city." };
}

/** A signed-in customer connects to (or switches to) a business from the directory. */
export async function chooseLaundry(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) return { error: "signin" };
  if (session.role !== "CUSTOMER") return { error: "Only customer accounts can choose a laundry." };
  const code = text(formData, "code").toUpperCase();
  const lat = Number(text(formData, "lat"));
  const lng = Number(text(formData, "lng"));
  if (!/^B-[A-Z0-9]{6}$/.test(code)) return { error: "That business isn't available." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("choose_business", {
    p_code: code,
    p_lat: validPoint(lat, lng) ? lat : null,
    p_lng: validPoint(lat, lng) ? lng : null,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/app", "layout");
  revalidatePath("/laundries");
  return { message: `You're now with ${(data as { name: string }).name}. Your basket's next pickup goes to them.` };
}
