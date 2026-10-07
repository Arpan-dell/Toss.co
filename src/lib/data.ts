import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";
import { isSupabaseConfigured, supabaseAdmin } from "./supabase/admin";
import type { Report } from "./ai/brain";
import type { AiAction, Customer, CustomerOffer, Device, Driver, Order, PlatformSettings, SubscriptionPayment, Tenant } from "./types";

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
    invoiceNumber: u(r.invoice_number),
    discountPct: u(r.discount_pct),
    amountBeforeDiscount: u(r.amount_before_discount),
    amountGross: u(r.amount_gross),
    creditApplied: (r.credit_applied as number) || undefined,
    reportedWeightKg: u(r.reported_weight_kg),
    weighedKg: u(r.weighed_kg),
    weightSource: u(r.weight_source),
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
  "id, name, price_per_kg, currency, join_code, manager_id, upi_id, upi_name, plan_status, trial_ends_at, paid_until, store_address, store_lat, store_lng, service_radius_km, listed, weigh_at_pickup, winback_enabled, winback_days, winback_pct, closure_requested_at, closure_reason, autopilot_enabled, autopilot_staffing, autopilot_winback, autopilot_nudges, autopilot_pricing, ai_max_discount, ai_price_min, ai_price_max, ai_price_step_pct, other_cost_per_kg, driver_pay_per_pickup, driver_pay_per_km";

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
    storeLat: u(r.store_lat),
    storeLng: u(r.store_lng),
    serviceRadiusKm: (r.service_radius_km as number) ?? 10,
    listed: r.listed !== false,
    weighAtPickup: r.weigh_at_pickup !== false,
    otherCostPerKg: (r.other_cost_per_kg as number) ?? 0,
    driverPayPerPickup: (r.driver_pay_per_pickup as number) ?? 0,
    driverPayPerKm: (r.driver_pay_per_km as number) ?? 0,
    planStatus: r.plan_status as Tenant["planStatus"],
    trialEndsAt: u(r.trial_ends_at),
    paidUntil: u(r.paid_until),
    winbackEnabled: r.winback_enabled !== false,
    winbackDays: (r.winback_days as number) ?? 30,
    winbackPct: (r.winback_pct as number) ?? 10,
    closureRequestedAt: u(r.closure_requested_at),
    closureReason: u(r.closure_reason),
    autopilot: {
      enabled: r.autopilot_enabled === true,
      staffing: r.autopilot_staffing !== false,
      winback: r.autopilot_winback !== false,
      nudges: r.autopilot_nudges !== false,
      pricing: r.autopilot_pricing === true,
      maxDiscount: (r.ai_max_discount as number) ?? 20,
      priceMin: u(r.ai_price_min),
      priceMax: u(r.ai_price_max),
      priceStepPct: (r.ai_price_step_pct as number) ?? 5,
    },
  };
}

// A business the caller can see (their own as manager, the one they joined as customer, any as owner).
export const getTenantById = cache(async (id: string | undefined): Promise<Tenant | undefined> => {
  if (!id) return undefined;
  const supabase = await db();
  const r = orThrow(await supabase.from("tenants").select(TENANT_COLUMNS).eq("id", id).maybeSingle()) as Row | null;
  return r ? toTenant(r) : undefined;
});

// No phone: customer numbers are private (managers can't read the column). A customer reads their
// own through my_phone(); drivers get it server-side with the pickup.
const CUSTOMER_COLUMNS = "id, customer_code, tenant_id, email, name, phone_verified, telegram_id";

function toCustomer(r: Row): Customer {
  return {
    id: r.id as string,
    customerCode: r.customer_code as string,
    tenantId: u(r.tenant_id),
    email: u(r.email),
    name: u(r.name),
    phoneVerified: Boolean(r.phone_verified),
    telegramId: u(r.telegram_id),
  };
}

export const getCustomer = cache(async (id: string): Promise<Customer | undefined> => {
  const supabase = await db();
  const r = orThrow(await supabase.from("customers").select(CUSTOMER_COLUMNS).eq("id", id).maybeSingle()) as Row | null;
  if (!r) return undefined;
  const customer = toCustomer(r);
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims.sub === id) customer.phone = u(orThrow(await supabase.rpc("my_phone")));
  return customer;
});

/** The latest Toss AI analysis of the manager's business. */
export async function getLatestAiRun(tenantId: string): Promise<{ id: number; createdAt: string; trigger: string; report: Report; error?: string } | undefined> {
  const supabase = await db();
  const rows = orThrow(
    await supabase.from("ai_runs").select("id, created_at, trigger, report, error").eq("tenant_id", tenantId).neq("trigger", "ask").order("created_at", { ascending: false }).limit(1),
  ) as Row[];
  const r = rows[0];
  return r ? { id: r.id as number, createdAt: r.created_at as string, trigger: r.trigger as string, report: r.report as Report, error: u(r.error) } : undefined;
}

/** Toss AI's action queue and recent decisions for the manager's business. */
export async function listAiActions(tenantId: string): Promise<AiAction[]> {
  const supabase = await db();
  const rows = orThrow(
    await supabase
      .from("ai_actions")
      .select("id, type, label, reason, impact, priority, status, auto, result, params, created_at, decided_at")
      .eq("tenant_id", tenantId)
      .neq("status", "EXPIRED")
      .order("created_at", { ascending: false })
      .limit(80),
  ) as Row[];
  return rows.map((r) => ({
    id: r.id as number,
    type: r.type as AiAction["type"],
    label: r.label as string,
    reason: r.reason as string,
    impact: r.impact as string,
    priority: r.priority as AiAction["priority"],
    status: r.status as AiAction["status"],
    auto: r.auto as boolean,
    result: u(r.result),
    message: u((r.params as Row | null)?.message),
    createdAt: r.created_at as string,
    decidedAt: u(r.decided_at),
  }));
}

/** Win-back offers of the manager's business: how many were sent and how many brought an order. */
export async function getOfferStats(tenantId: string): Promise<{ sent: number; redeemed: number }> {
  const supabase = await db();
  const [sent, redeemed] = await Promise.all([
    supabase.from("customer_offers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase.from("customer_offers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).not("redeemed_at", "is", null),
  ]);
  return { sent: sent.count ?? 0, redeemed: redeemed.count ?? 0 };
}

/** The signed-in customer's best unexpired discount waiting for their next pickup, if any. */
export async function getOpenOffer(customerId: string, tenantId: string | undefined): Promise<CustomerOffer | undefined> {
  if (!tenantId) return undefined;
  const supabase = await db();
  const rows = orThrow(
    await supabase
      .from("customer_offers")
      .select("id, tenant_id, percent, expires_at")
      .eq("customer_id", customerId)
      .eq("tenant_id", tenantId)
      .is("redeemed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("percent", { ascending: false })
      .limit(1),
  ) as Row[];
  const r = rows[0];
  return r ? { id: r.id as number, tenantId: r.tenant_id as string, percent: r.percent as number, expiresAt: r.expires_at as string } : undefined;
}

// Customers visible to the caller: a manager's own customers, or everyone for the owner.
export const listCustomers = cache(async (): Promise<Customer[]> => {
  const supabase = await db();
  const rows = orThrow(await supabase.from("customers").select(CUSTOMER_COLUMNS).order("name"));
  return (rows as Row[]).map(toCustomer);
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
    await supabase.from("platform_settings").select("monthly_price, trial_days, owner_upi_id, owner_upi_name, discount_3m, discount_6m, discount_12m, basket_price, basket_credit, credit_per_kg, credit_max_pct, credit_toss_share_pct, credit_sub_max_pct, credit_valid_days").eq("id", 1).maybeSingle(),
  ) as Row | null;
  return {
    monthlyPrice: (r?.monthly_price as number) ?? 0,
    trialDays: (r?.trial_days as number) ?? 0,
    ownerUpiId: u(r?.owner_upi_id),
    ownerUpiName: (r?.owner_upi_name as string) ?? "Toss",
    discount3m: (r?.discount_3m as number) ?? 0,
    discount6m: (r?.discount_6m as number) ?? 0,
    discount12m: (r?.discount_12m as number) ?? 0,
    basketPrice: (r?.basket_price as number) ?? 800,
    basketCredit: (r?.basket_credit as number) ?? 500,
    creditPerKg: (r?.credit_per_kg as number) ?? 8,
    creditMaxPct: (r?.credit_max_pct as number) ?? 30,
    creditTossSharePct: (r?.credit_toss_share_pct as number) ?? 50,
    creditSubMaxPct: (r?.credit_sub_max_pct as number) ?? 50,
    creditValidDays: (r?.credit_valid_days as number) ?? 180,
  };
});

// Public (signed-out) view of the plan for the landing page. platform_settings is readable only by signed-in
// users, so this uses the service-role client and selects just the non-sensitive pricing columns (never the
// owner's UPI ID). Returns null when unavailable so the page still renders.
export type PublicPlan = { monthlyPrice: number; trialDays: number; discount3m: number; discount6m: number; discount12m: number; basketPrice: number; basketCredit: number };
export async function getPublicPlan(): Promise<PublicPlan | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabaseAdmin()
      .from("platform_settings")
      .select("monthly_price, trial_days, discount_3m, discount_6m, discount_12m, basket_price, basket_credit")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      monthlyPrice: Number(data.monthly_price) || 0,
      trialDays: Number(data.trial_days) || 0,
      discount3m: Number(data.discount_3m) || 0,
      discount6m: Number(data.discount_6m) || 0,
      discount12m: Number(data.discount_12m) || 0,
      basketPrice: Number(data.basket_price) || 0,
      basketCredit: Number(data.basket_credit) || 0,
    };
  } catch {
    return null;
  }
}

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
    await supabase.from("drivers").select("id, tenant_id, name, phone, telegram_chat_id, status, last_lat, last_lng, location_at, max_jobs").order("name"),
  );
  return (rows as Row[]).map((r) => ({
    id: r.id as string,
    tenantId: r.tenant_id as string,
    name: r.name as string,
    phone: u(r.phone),
    telegramChatId: u(r.telegram_chat_id),
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

// ---------- basket credits (migration 0020) ----------
export type CustomerCredit = { granted: number; used: number; left: number; expiresAt: string; expired: boolean };

/** The signed-in customer's basket credit, or null if they have none. RLS limits both reads to their own rows. */
export async function getCustomerCredit(customerId: string): Promise<CustomerCredit | null> {
  const supabase = await db();
  const w = orThrow(await supabase.from("customer_credits").select("granted, expires_at").eq("customer_id", customerId).maybeSingle()) as Row | null;
  if (!w) return null;
  const used = (orThrow(await supabase.from("orders").select("credit_applied").eq("customer_id", customerId).neq("status", "CANCELLED").gt("credit_applied", 0)) as Row[]).reduce(
    (a, r) => a + ((r.credit_applied as number) ?? 0),
    0,
  );
  const granted = w.granted as number;
  const expired = new Date(w.expires_at as string).getTime() <= Date.now();
  return { granted, used, left: expired ? 0 : Math.max(0, granted - used), expiresAt: w.expires_at as string, expired };
}

/** Toss's share of basket credit this laundry has given, not yet used against a subscription payment. */
export async function getTenantCreditBalance(tenantId: string): Promise<number> {
  const supabase = await db();
  const { data, error } = await supabase.rpc("tenant_credit_balance", { p_tenant: tenantId });
  if (error) return 0;
  return Math.max(0, Math.floor(Number(data) || 0));
}

export type CreditGrant = { id: number; customerName?: string; customerCode?: string; deviceId?: string; amount: number; note?: string; grantedAt: string };

/** Owner: the latest basket credit grants. */
export async function listCreditGrants(limit = 20): Promise<CreditGrant[]> {
  const supabase = await db();
  const rows = orThrow(
    await supabase.from("credit_grants").select("id, device_id, amount, note, granted_at, customers(name, customer_code)").order("granted_at", { ascending: false }).limit(limit),
  ) as Row[];
  return rows.map((r) => {
    const c = (Array.isArray(r.customers) ? r.customers[0] : r.customers) as Row | null;
    return {
      id: r.id as number,
      customerName: u(c?.name),
      customerCode: u(c?.customer_code),
      deviceId: u(r.device_id),
      amount: r.amount as number,
      note: u(r.note),
      grantedAt: r.granted_at as string,
    };
  });
}

// ---------- supplies (migration 0021) ----------
export type Supply = {
  id: string;
  name: string;
  unit: "ml" | "l" | "g" | "kg" | "pcs";
  perKg: number;
  perOrder: number;
  stock: number;
  lowAt: number;
  costPerUnit: number;
  supplierPhone?: string;
  alertedAt?: string;
};

export const listSupplies = cache(async (): Promise<Supply[]> => {
  const supabase = await db();
  const rows = orThrow(
    await supabase.from("supplies").select("id, name, unit, per_kg, per_order, stock, low_at, cost_per_unit, supplier_phone, alerted_at").order("name"),
  ) as Row[];
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    unit: r.unit as Supply["unit"],
    perKg: r.per_kg as number,
    perOrder: r.per_order as number,
    stock: r.stock as number,
    lowAt: r.low_at as number,
    costPerUnit: r.cost_per_unit as number,
    supplierPhone: u(r.supplier_phone),
    alertedAt: u(r.alerted_at),
  }));
});
