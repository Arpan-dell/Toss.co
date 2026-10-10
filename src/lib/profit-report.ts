import "server-only";
import { getPlatformSettings, getTenantById, listDrivers, listOrders, listSupplies } from "./data";
import { distanceKm } from "./dispatch/core";
import { driverPay, orderProfit, supplyRates, type OrderProfit } from "./profit";
import { createClient } from "./supabase/server";
import type { Order } from "./types";

// Profit for the signed-in manager's business over a period: what each completed pickup earned after supplies,
// running costs and driver pay (a salaried driver costs their salary spread over their trips in the period).
// Shared by the Profit page and the assistant ("profit this week"), so both always agree. The maths per order
// is lib/profit.ts.

export type ProfitReport = {
  rows: { o: Order; p: OrderProfit }[];
  pickups: number;
  kg: number;
  earned: number; // paid by customers + Toss's share of basket credit
  supplies: number;
  other: number;
  driver: number;
  costs: number;
  profit: number;
};

export async function profitReport(tenantId: string | undefined, from: Date, to: Date = new Date()): Promise<ProfitReport | null> {
  const supabase = await createClient();
  const [tenant, platform, supplies, orders, devices, drivers] = await Promise.all([
    getTenantById(tenantId),
    getPlatformSettings(),
    listSupplies(),
    listOrders({ status: "COMPLETED" }),
    supabase.from("devices").select("device_id, lat, lng"),
    listDrivers(),
  ]);
  if (!tenant) return null;
  const costs = {
    otherCostPerKg: tenant.otherCostPerKg,
    driverPayPerPickup: tenant.driverPayPerPickup,
    driverPayPerKm: tenant.driverPayPerKm,
    tossSharePct: platform.creditTossSharePct,
  };
  const rates = supplyRates(supplies);
  const store = tenant.storeLat != null && tenant.storeLng != null ? { lat: tenant.storeLat, lng: tenant.storeLng } : null;
  const where = new Map((devices.data ?? []).filter((d) => d.lat != null && d.lng != null).map((d) => [d.device_id as string, { lat: d.lat as number, lng: d.lng as number }]));

  const inRange = orders.filter((o) => {
    const at = new Date(o.completedAt ?? o.createdAt).getTime();
    return at >= from.getTime() && at < to.getTime();
  });
  // a salaried driver's monthly salary, spread over their trips (pickups + deliveries), scaled to the period
  const days = Math.max(1, (to.getTime() - from.getTime()) / 86_400_000);
  const tripCount = new Map<string, number>();
  for (const o of inRange) {
    if (o.driverId) tripCount.set(o.driverId, (tripCount.get(o.driverId) ?? 0) + 1);
    if (o.deliveryStatus === "DELIVERED" && o.deliveryDriverId) tripCount.set(o.deliveryDriverId, (tripCount.get(o.deliveryDriverId) ?? 0) + 1);
  }
  const salaryPerTrip = new Map(
    drivers
      .filter((d) => d.payType === "SALARY" && d.telegramChatId)
      .map((d) => [d.telegramChatId!, (d.monthlySalary * Math.min(1, days / 30)) / Math.max(1, tripCount.get(d.telegramChatId!) ?? 0)]),
  );
  const tripCost = (chatId: string | undefined, km?: number) => (chatId && salaryPerTrip.has(chatId) ? salaryPerTrip.get(chatId)! : driverPay(costs, km));
  const rows = inRange.map((o) => {
    const at = where.get(o.deviceId);
    const km = store && at ? distanceKm(store, at) : undefined;
    const driverCost = tripCost(o.driverId, km) + (o.deliveryStatus === "DELIVERED" ? tripCost(o.deliveryDriverId, km) : 0);
    return { o, p: orderProfit(o, rates, costs, km, driverCost) };
  });
  const sum = (f: (p: OrderProfit) => number) => rows.reduce((a, r) => a + f(r.p), 0);
  const supplyTotal = sum((p) => p.supplies), other = sum((p) => p.other), driver = sum((p) => p.driver);
  return {
    rows,
    pickups: rows.length,
    kg: rows.reduce((a, r) => a + (r.o.weightKg || 0), 0),
    earned: sum((p) => p.paid + p.tossPayback),
    supplies: supplyTotal,
    other,
    driver,
    costs: supplyTotal + other + driver,
    profit: sum((p) => p.profit),
  };
}
