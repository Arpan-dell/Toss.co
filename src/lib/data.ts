import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";
import type { Customer, Device, Driver, Order, Tenant } from "./types";

// Data access layer. Every query runs as the signed-in user, so Postgres RLS decides what is
// visible: customers see only their own rows, managers see the whole tenant.

export const DEVICE_ONLINE_WINDOW_MS = 10 * 60_000;
const MAX_ORDERS = 1000;
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID ?? "tenant-delhi-01";

export function now(): Date {
  return new Date();
}

type Row = Record<string, unknown>;
const u = <T>(v: unknown) => (v ?? undefined) as T | undefined;

function toOrder(r: Row): Order {
  return {
    id: r.id as string,
    deviceOrderId: r.device_order_id as number,
    deviceId: r.device_id as string,
    tenantId: r.tenant_id as string,
    customerTelegramId: u(r.customer_telegram_id),
    customerId: u(r.customer_id),
    driverId: u(r.driver_id),
    address: (r.address as string) ?? "",
    weightKg: r.weight_kg as number,
    status: r.status as Order["status"],
    paymentStatus: r.payment_status as Order["paymentStatus"],
    amountDue: r.amount_due as number,
    createdAt: r.placed_at as string,
    acceptedAt: u(r.accepted_at),
    completedAt: u(r.completed_at),
  };
}

function toDevice(r: Row): Device {
  return {
    deviceId: r.device_id as string,
    tenantId: r.tenant_id as string,
    ownerTelegramId: u(r.owner_telegram_id),
    customerId: u(r.customer_id),
    address: u(r.address),
    area: u(r.area),
    targetKg: u(r.target_kg),
    lastWeightKg: u(r.last_weight_kg),
    lastSeenAt: u(r.last_seen_at),
    firmwareVersion: u(r.firmware_version),
    wifiRssi: u(r.wifi_rssi),
  };
}

// Never select api_key_hash: client roles have no privilege on that column.
const DEVICE_COLUMNS =
  "device_id, tenant_id, owner_telegram_id, customer_id, address, area, target_kg, last_weight_kg, last_seen_at, firmware_version, wifi_rssi";

async function db() {
  return createClient();
}

function orThrow<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export const getTenant = cache(async (): Promise<Tenant> => {
  const supabase = await db();
  const r = orThrow(await supabase.from("tenants").select("id, name, price_per_kg, currency").eq("id", DEFAULT_TENANT_ID).maybeSingle()) as Row | null;
  return r
    ? { id: r.id as string, name: r.name as string, pricePerKg: r.price_per_kg as number, currency: r.currency as string }
    : { id: DEFAULT_TENANT_ID, name: "Toss", pricePerKg: 0, currency: "INR" };
});

export const getCustomer = cache(async (id: string): Promise<Customer | undefined> => {
  const supabase = await db();
  const r = orThrow(await supabase.from("customers").select("id, tenant_id, email, name, telegram_id").eq("id", id).maybeSingle()) as Row | null;
  return r
    ? { id: r.id as string, tenantId: r.tenant_id as string, email: u(r.email), name: u(r.name), telegramId: u(r.telegram_id) }
    : undefined;
});

export async function listOrdersForCustomer(customerId: string): Promise<Order[]> {
  const supabase = await db();
  const rows = orThrow(
    await supabase.from("orders").select("*").eq("customer_id", customerId).order("placed_at", { ascending: false }).limit(MAX_ORDERS),
  );
  return (rows as Row[]).map(toOrder);
}

export const listOrders = cache(async (filter?: { status?: Order["status"]; q?: string }): Promise<Order[]> => {
  const supabase = await db();
  let query = supabase.from("orders").select("*").order("placed_at", { ascending: false }).limit(MAX_ORDERS);
  if (filter?.status) query = query.eq("status", filter.status);
  let orders = (orThrow(await query) as Row[]).map(toOrder);
  // Free-text search in memory: avoids building PostgREST filter strings from user input.
  if (filter?.q) {
    const q = filter.q.toLowerCase();
    orders = orders.filter(
      (o) => o.id.toLowerCase().includes(q) || o.address.toLowerCase().includes(q) || (o.customerTelegramId ?? "").includes(q),
    );
  }
  return orders;
});

export async function listActiveOrders(): Promise<Order[]> {
  const supabase = await db();
  const rows = orThrow(
    await supabase.from("orders").select("*").in("status", ["PENDING", "ACCEPTED"]).order("placed_at", { ascending: false }),
  );
  return (rows as Row[]).map(toOrder);
}

export const listDevices = cache(async (): Promise<Device[]> => {
  const supabase = await db();
  const rows = orThrow(await supabase.from("devices").select(DEVICE_COLUMNS).order("last_seen_at", { ascending: false, nullsFirst: false }));
  return (rows as Row[]).map(toDevice);
});

export async function getDeviceForCustomer(customerId: string): Promise<Device | undefined> {
  const supabase = await db();
  const rows = orThrow(
    await supabase.from("devices").select(DEVICE_COLUMNS).eq("customer_id", customerId).order("last_seen_at", { ascending: false }).limit(1),
  );
  return (rows as Row[])[0] ? toDevice((rows as Row[])[0]) : undefined;
}

export async function listDrivers(): Promise<Driver[]> {
  const supabase = await db();
  const rows = orThrow(await supabase.from("drivers").select("id, tenant_id, name, telegram_chat_id, status").order("name"));
  return (rows as Row[]).map((r) => ({
    id: r.id as string,
    tenantId: r.tenant_id as string,
    name: r.name as string,
    telegramChatId: r.telegram_chat_id as string,
    status: r.status as Driver["status"],
  }));
}

export function isDeviceOnline(device: Device): boolean {
  if (!device.lastSeenAt) return false;
  return now().getTime() - new Date(device.lastSeenAt).getTime() < DEVICE_ONLINE_WINDOW_MS;
}

// Human label for a basket: manager-set area, else the address, else the device ID.
export function deviceLabel(device?: Device): string {
  return device?.area || device?.address || device?.deviceId || "Unknown basket";
}
