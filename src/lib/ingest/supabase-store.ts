import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderRecord } from "./core";
import type { DeviceFields, IngestStore, StoredOrder } from "./handle";

// Maps the camelCase ingest model onto the snake_case Postgres schema (supabase/migrations).

type OrderRow = {
  id: string;
  device_order_id: number;
  device_id: string;
  tenant_id: string;
  customer_telegram_id: string | null;
  customer_id: string | null;
  driver_id: string | null;
  address: string;
  weight_kg: number;
  status: OrderRecord["status"];
  payment_status: OrderRecord["paymentStatus"];
  amount_due: number;
  placed_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

const u = <T>(v: T | null) => v ?? undefined;

function fromRow(r: OrderRow): StoredOrder {
  return {
    id: r.id,
    deviceOrderId: r.device_order_id,
    deviceId: r.device_id,
    tenantId: r.tenant_id,
    customerTelegramId: u(r.customer_telegram_id),
    customerId: u(r.customer_id),
    driverId: u(r.driver_id),
    address: r.address,
    weightKg: r.weight_kg,
    status: r.status,
    paymentStatus: r.payment_status,
    amountDue: r.amount_due,
    placedAt: r.placed_at,
    acceptedAt: u(r.accepted_at),
    completedAt: u(r.completed_at),
    updatedAt: r.updated_at,
  };
}

// payment_status is deliberately not written here: it is owned by the payment flow.
function toRow(o: OrderRecord) {
  return {
    id: o.id,
    device_order_id: o.deviceOrderId,
    device_id: o.deviceId,
    tenant_id: o.tenantId,
    customer_telegram_id: o.customerTelegramId ?? null,
    customer_id: o.customerId ?? null,
    driver_id: o.driverId ?? null,
    address: o.address,
    weight_kg: o.weightKg,
    status: o.status,
    amount_due: o.amountDue,
    placed_at: o.placedAt,
    accepted_at: o.acceptedAt ?? null,
    completed_at: o.completedAt ?? null,
  };
}

export class SupabaseStore implements IngestStore {
  constructor(private db: SupabaseClient) {}

  async getDeviceKeyHash(deviceId: string) {
    const { data, error } = await this.db.from("devices").select("api_key_hash").eq("device_id", deviceId).maybeSingle();
    if (error) throw error;
    return u(data?.api_key_hash as string | null);
  }

  async findCustomerIdByTelegram(telegramId: string) {
    const { data, error } = await this.db.from("customers").select("id").eq("telegram_id", telegramId).maybeSingle();
    if (error) throw error;
    return u(data?.id as string | null);
  }

  async getPricePerKg(tenantId: string) {
    const { data, error } = await this.db.from("tenants").select("price_per_kg").eq("id", tenantId).maybeSingle();
    if (error) throw error;
    return u(data?.price_per_kg as number | null);
  }

  async getOrder(id: string) {
    const { data, error } = await this.db.from("orders").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? fromRow(data as OrderRow) : undefined;
  }

  async saveOrder(record: OrderRecord, _now: string, prevUpdatedAt: string | undefined) {
    if (prevUpdatedAt === undefined) {
      const { error } = await this.db.from("orders").insert({ ...toRow(record), payment_status: record.paymentStatus });
      if (error?.code === "23505") return false; // created concurrently
      if (error) throw error;
      return true;
    }
    const { data, error } = await this.db
      .from("orders")
      .update(toRow(record))
      .eq("id", record.id)
      .eq("updated_at", prevUpdatedAt)
      .select("id");
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }

  async appendEvent(e: { orderId: string; deviceId: string; type: string; at: string; payload: unknown }) {
    const { error } = await this.db
      .from("order_events")
      .insert({ order_id: e.orderId, device_id: e.deviceId, type: e.type, at: e.at, payload: e.payload });
    if (error) throw error;
  }

  async touchDevice(deviceId: string, tenantId: string, now: string, f: DeviceFields) {
    const fields = {
      last_weight_kg: f.weightKg,
      target_kg: f.targetKg,
      wifi_rssi: f.rssi,
      address: f.address,
      owner_telegram_id: f.ownerTelegramId,
      firmware_version: f.fwVersion,
    };
    const defined = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));

    const { error: insertError } = await this.db
      .from("devices")
      .insert({ device_id: deviceId, tenant_id: tenantId, last_seen_at: now, ...defined });
    if (!insertError) return;
    if (insertError.code !== "23505") throw insertError;

    // Existing device: update only the fields this payload carries (never tenant or key hash).
    const { error } = await this.db
      .from("devices")
      .update({ last_seen_at: now, ...defined })
      .eq("device_id", deviceId);
    if (error) throw error;
  }
}
