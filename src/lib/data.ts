import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";
import type { Customer, Device, Driver, Order, PlatformSettings, SubscriptionPayment, Tenant } from "./types";

// Data access layer. Every query runs as the signed-in user, so Postgres RLS decides what is
// visible: customers see only their own rows, managers their own business, the owner everything.

export const DEVICE_ONLINE_WINDOW_MS = 10 * 60_000;
const MAX_ORDERS = 1000;

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
    tenantId: u(r.tenant_id),
    customerTelegramId: u(r.customer_telegram_id),
    customerId: u(r.customer_id),
    driverId: u(r.driver_id),
    address: (r.address as string) ?? "",
    weightKg: r.weight_kg as number,
    status: r.status as Order["status"],
    paymentStatus: r.payment_status as Order["paymentStatus"],
    paymentMethod: u(r.payment_method),
    paymentRef: u(r.payment_ref),
    paymentReportedAt: u(r.payment_reported_at),
    paymentConfirmedAt: u(r.payment_confirmed_at),
    amountDue: r.amount_due as number,
    createdAt: r.placed_at as string,
    acceptedAt: u(r.accepted_at),
    completedAt: u(r.completed_at),
  };
}

function toDevice(r: Row): Device {
  return {
    deviceId: r.device_id as string,
    tenantId: u(r.tenant_id),
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

const TENANT_COLUMNS =
  "id, name, price_per_kg, currency, join_code, manager_id, upi_id, upi_name, plan_status, trial_ends_at, paid_until, store_address, store_lat";

function toTenant(r: Row): Tenant {
  return {
    id: r.id as string,
    name: r.name as string,
    pricePerKg: r.price_per_kg as number,
    currency: r.currency as string,
    joinCode: r.join_code as string,
    managerId: u(r.manager_id),
    upiId: u(r.upi_id),
    upiName: u(r.upi_name),
    storeAddress: u(r.store_address),
    storeLocated: r.store_lat != null,
    planStatus: r.plan_status as Tenant["planStatus"],
    trialEndsAt: u(r.trial_ends_at),
    paidUntil: u(r.paid_until),
  };
}

// A business the caller can see (their own as manager, the one they joined as customer, any as owner).
export const getTenantById = cache(async (id: string | undefined): Promise<Tenant | undefined> => {
  if (!id) return undefined;
  const supabase = await db();
  const r = orThrow(await supabase.from("tenants").select(TENANT_COLUMNS).eq("id", id).maybeSingle()) as Row | null;
  return r ? toTenant(r) : undefined;
});

export const getCustomer = cache(async (id: string): Promise<Customer | undefined> => {
  const supabase = await db();
  const r = orThrow(
    await supabase.from("customers").select("id, customer_code, tenant_id, email, name, telegram_id").eq("id", id).maybeSingle(),
  ) as Row | null;
  return r
    ? {
        id: r.id as string,
        customerCode: r.customer_code as string,
        tenantId: u(r.tenant_id),
        email: u(r.email),
        name: u(r.name),
        telegramId: u(r.telegram_id),
      }
    : undefined;
});

// Customers visible to the caller: a manager's own customers, or everyone for the owner.
export const listCustomers = cache(async (): Promise<Customer[]> => {
  const supabase = await db();
  const rows = orThrow(await supabase.from("customers").select("id, customer_code, tenant_id, email, name, telegram_id").order("name"));
  return (rows as Row[]).map((r) => ({
    id: r.id as string,
    customerCode: r.customer_code as string,
    tenantId: u(r.tenant_id),
    email: u(r.email),
    name: u(r.name),
    telegramId: u(r.telegram_id),
  }));
});

export async function getOrder(id: string): Promise<Order | undefined> {
  const supabase = await db();
  const r = orThrow(await supabase.from("orders").select("*").eq("id", id).maybeSingle()) as Row | null;
  return r ? toOrder(r) : undefined;
}

export interface OrderEventRow {
  id: number;
  type: string;
  at: string;
  payload: unknown;
}

// Every payload the basket/bridge sent for this order (status changes, retries ignored).
export async function listOrderEvents(orderId: string): Promise<OrderEventRow[]> {
  const supabase = await db();
  const rows = orThrow(await supabase.from("order_events").select("id, type, at, payload").eq("order_id", orderId).order("at"));
  return (rows as Row[]).map((r) => ({ id: r.id as number, type: r.type as string, at: r.at as string, payload: r.payload }));
}

// ---------- owner / billing ----------

export const getPlatformSettings = cache(async (): Promise<PlatformSettings> => {
  const supabase = await db();
  const r = orThrow(
    await supabase.from("platform_settings").select("monthly_price, trial_days, owner_upi_id, owner_upi_name").eq("id", 1).maybeSingle(),
  ) as Row | null;
  return {
    monthlyPrice: (r?.monthly_price as number) ?? 0,
    trialDays: (r?.trial_days as number) ?? 0,
    ownerUpiId: u(r?.owner_upi_id),
    ownerUpiName: (r?.owner_upi_name as string) ?? "Toss",
  };
});

export async function listTenants(): Promise<Tenant[]> {
  const supabase = await db();
  const rows = orThrow(await supabase.from("tenants").select(TENANT_COLUMNS).order("name"));
  return (rows as Row[]).map(toTenant);
}

// Owner view: who runs each business and how big it is.
export async function listTenantStats(tenants: Tenant[]) {
  const supabase = await db();
  const [customers, orders] = await Promise.all([
    supabase.from("customers").select("id, tenant_id, email"),
    supabase.from("orders").select("tenant_id").not("tenant_id", "is", null).limit(10_000),
  ]);
  const customerRows = orThrow(customers) as Row[];
  const stats = new Map<string, { customers: number; orders: number; managerEmail?: string }>();
  const get = (id: string) => stats.get(id) ?? stats.set(id, { customers: 0, orders: 0 }).get(id)!;
  for (const c of customerRows) if (c.tenant_id) get(c.tenant_id as string).customers++;
  for (const o of orThrow(orders) as Row[]) get(o.tenant_id as string).orders++;
  const emails = new Map(customerRows.map((c) => [c.id as string, u<string>(c.email)]));
  for (const t of tenants) if (t.managerId) get(t.id).managerEmail = emails.get(t.managerId);
  return stats;
}

export async function listSubscriptionPayments(filter?: { tenantId?: string; status?: SubscriptionPayment["status"] }) {
  const supabase = await db();
  let q = supabase
    .from("subscription_payments")
    .select("id, tenant_id, months, amount, payment_ref, status, created_at, reviewed_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter?.tenantId) q = q.eq("tenant_id", filter.tenantId);
  if (filter?.status) q = q.eq("status", filter.status);
  return (orThrow(await q) as Row[]).map(
    (r): SubscriptionPayment => ({
      id: r.id as number,
      tenantId: r.tenant_id as string,
      months: r.months as number,
      amount: r.amount as number,
      paymentRef: r.payment_ref as string,
      status: r.status as SubscriptionPayment["status"],
      createdAt: r.created_at as string,
      reviewedAt: u(r.reviewed_at),
    }),
  );
}

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
  const rows = orThrow(
    await supabase.from("drivers").select("id, tenant_id, name, telegram_chat_id, status, last_lat, last_lng, location_at, max_jobs").order("name"),
  );
  return (rows as Row[]).map((r) => ({
    id: r.id as string,
    tenantId: r.tenant_id as string,
    name: r.name as string,
    telegramChatId: r.telegram_chat_id as string,
    status: r.status as Driver["status"],
    location: r.last_lat != null ? { lat: r.last_lat as number, lng: r.last_lng as number } : undefined,
    locationAt: u(r.location_at),
    maxJobs: (r.max_jobs as number) ?? 3,
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
