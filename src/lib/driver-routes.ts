import "server-only";
import type { LatLng } from "./dispatch/core";
import { routeKm, type JobEvent } from "./route-distance";
import { createClient } from "./supabase/server";
import type { Order, Tenant } from "./types";

/**
 * Kilometres each driver covered on their jobs since `from` (pickups and deliveries, from their starting point,
 * stop to stop; see route-distance.ts). Keyed by the driver's Telegram chat id, as orders store it.
 */
export async function driverRouteKm(orders: Order[], tenant: Pick<Tenant, "storeLat" | "storeLng" | "timezone">, from: string, to = "9999"): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.from("devices").select("device_id, lat, lng");
  const basket = new Map((data ?? []).filter((d) => d.lat != null && d.lng != null).map((d) => [d.device_id as string, { lat: Number(d.lat), lng: Number(d.lng) } as LatLng]));
  const store = tenant.storeLat != null && tenant.storeLng != null ? { lat: tenant.storeLat, lng: tenant.storeLng } : undefined;

  const byDriver = new Map<string, JobEvent[]>();
  const add = (chatId: string, e: JobEvent) => byDriver.set(chatId, [...(byDriver.get(chatId) ?? []), e]);
  for (const o of orders) {
    if (o.driverId && o.completedAt && o.completedAt >= from && o.completedAt < to) add(o.driverId, { kind: "pickup", at: o.completedAt, point: basket.get(o.deviceId), start: o.pickupStart });
    if (o.deliveryDriverId && o.deliveredAt && o.deliveryStatus === "DELIVERED" && o.deliveredAt >= from && o.deliveredAt < to)
      add(o.deliveryDriverId, { kind: "delivery", at: o.deliveredAt, point: basket.get(o.deviceId), start: o.deliveryStart });
  }
  const km = new Map<string, number>();
  for (const [chatId, events] of byDriver) km.set(chatId, routeKm(events, store, tenant.timezone || "Asia/Kolkata"));
  return km;
}
