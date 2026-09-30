// Pure ingest logic for device/bridge payloads — no AWS imports, fully unit-tested.
//
// Accepts two payload shapes:
//   legacy (firmware v1 via the Apps Script bridge):
//     { orderId, customerId, address, weight, status, paymentStatus }
//   v2 (firmware v2 direct):
//     { type: "order", deviceId, orderId, status, weight, address?, customerTelegramId?, driverId?, fwVersion? }
//     { type: "heartbeat", deviceId, weight, targetKg?, rssi?, address?, ownerTelegramId?, fwVersion? }

export const ORDER_STATUSES = ["PENDING", "ACCEPTED", "COMPLETED", "CANCELLED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentStatus = "UNPAID" | "PENDING" | "PAID" | "REFUNDED";

export interface OrderEvent {
  kind: "order";
  deviceId: string;
  deviceOrderId: number;
  status: OrderStatus;
  weightKg: number;
  address?: string;
  customerTelegramId?: string;
  driverId?: string;
  fwVersion?: string;
  at?: string; // only honoured for trusted (bridge/backfill) callers
}

export interface HeartbeatEvent {
  kind: "heartbeat";
  deviceId: string;
  weightKg: number;
  targetKg?: number;
  rssi?: number;
  address?: string;
  ownerTelegramId?: string;
  fwVersion?: string;
}

export type IngestEvent = OrderEvent | HeartbeatEvent;

export interface OrderRecord {
  id: string;
  deviceOrderId: number;
  deviceId: string;
  tenantId: string;
  customerTelegramId?: string;
  customerId?: string;
  driverId?: string;
  address: string;
  weightKg: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  amountDue: number;
  placedAt: string;
  acceptedAt?: string;
  completedAt?: string;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const MAX_STR = 300;
const DEVICE_ID = /^[A-Za-z0-9:_-]{1,64}$/;
const TELEGRAM_ID = /^-?\d{1,20}$/;

function str(v: unknown, max = MAX_STR): string | undefined {
  if (typeof v === "number") v = String(v);
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s && s.length <= max ? s : undefined;
}

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function isoOrUndefined(v: unknown): string | undefined {
  const s = str(v, 40);
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

export function legacyDeviceId(customerTelegramId: string) {
  return `legacy-${customerTelegramId}`;
}

export function orderKey(deviceId: string, deviceOrderId: number) {
  return `${deviceId}#${deviceOrderId}`;
}

export function parsePayload(body: unknown, opts: { trusted: boolean }): Result<IngestEvent> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Body must be a JSON object" };
  const b = body as Record<string, unknown>;
  const isLegacy = b.type === undefined && b.deviceId === undefined && b.customerId !== undefined;

  const customerTelegramId = str(isLegacy ? b.customerId : b.customerTelegramId, 20);
  if (customerTelegramId && !TELEGRAM_ID.test(customerTelegramId)) return { ok: false, error: "Invalid customer Telegram ID" };

  let deviceId: string | undefined;
  if (isLegacy) {
    if (!customerTelegramId) return { ok: false, error: "Legacy payload needs customerId" };
    deviceId = legacyDeviceId(customerTelegramId);
  } else {
    deviceId = str(b.deviceId, 64);
    if (!deviceId || !DEVICE_ID.test(deviceId)) return { ok: false, error: "Invalid deviceId" };
  }

  const weightKg = num(b.weight);
  if (weightKg === undefined || weightKg < 0 || weightKg > 200) return { ok: false, error: "Invalid weight" };
  const address = str(b.address);
  const fwVersion = str(b.fwVersion, 20);

  const type = isLegacy ? "order" : b.type;
  if (type === "heartbeat") {
    const ownerTelegramId = str(b.ownerTelegramId, 20);
    if (ownerTelegramId && !TELEGRAM_ID.test(ownerTelegramId)) return { ok: false, error: "Invalid owner Telegram ID" };
    const targetKg = num(b.targetKg);
    const rssi = num(b.rssi);
    return {
      ok: true,
      value: {
        kind: "heartbeat",
        deviceId,
        weightKg,
        targetKg: targetKg !== undefined && targetKg > 0 && targetKg <= 200 ? targetKg : undefined,
        rssi: rssi !== undefined && rssi <= 0 && rssi >= -130 ? Math.round(rssi) : undefined,
        address,
        ownerTelegramId,
        fwVersion,
      },
    };
  }
  if (type !== "order") return { ok: false, error: "Unknown payload type" };

  const deviceOrderId = num(b.orderId);
  if (deviceOrderId === undefined || !Number.isInteger(deviceOrderId) || deviceOrderId < 0)
    return { ok: false, error: "Invalid orderId" };

  const status = str(b.status, 20)?.toUpperCase();
  if (!ORDER_STATUSES.includes(status as OrderStatus)) return { ok: false, error: "Invalid status" };

  const driverId = str(b.driverId, 20);
  if (driverId && !TELEGRAM_ID.test(driverId)) return { ok: false, error: "Invalid driverId" };

  // Note: payload.paymentStatus is deliberately ignored — payment is server-owned.
  return {
    ok: true,
    value: {
      kind: "order",
      deviceId,
      deviceOrderId,
      status: status as OrderStatus,
      weightKg,
      address,
      customerTelegramId,
      driverId,
      fwVersion,
      at: opts.trusted ? isoOrUndefined(b.at ?? b.timestamp) : undefined,
    },
  };
}

const RANK: Record<OrderStatus, number> = { PENDING: 0, ACCEPTED: 1, COMPLETED: 2, CANCELLED: 2 };

/**
 * Applies an order event to the stored record.
 * - Status only moves forward (late/retried "ACCEPTED" can't undo "COMPLETED").
 * - paymentStatus is never taken from the device.
 * - Weight and placement time are fixed at creation.
 */
export function mergeOrder(
  existing: OrderRecord | undefined,
  ev: OrderEvent,
  ctx: { now: string; tenantId: string; pricePerKg: number; customerId?: string },
): { record: OrderRecord; changed: boolean } {
  const at = ev.at ?? ctx.now;

  if (!existing) {
    const record: OrderRecord = {
      id: orderKey(ev.deviceId, ev.deviceOrderId),
      deviceOrderId: ev.deviceOrderId,
      deviceId: ev.deviceId,
      tenantId: ctx.tenantId,
      customerTelegramId: ev.customerTelegramId,
      customerId: ctx.customerId,
      driverId: ev.driverId,
      address: ev.address ?? "",
      weightKg: Math.round(ev.weightKg * 100) / 100,
      status: ev.status,
      paymentStatus: "UNPAID",
      amountDue: Math.round(ev.weightKg * ctx.pricePerKg),
      placedAt: at,
    };
    if (RANK[ev.status] >= 1 && ev.status !== "CANCELLED") record.acceptedAt = at;
    if (ev.status === "COMPLETED") record.completedAt = at;
    return { record, changed: true };
  }

  const record: OrderRecord = { ...existing };
  const forward =
    RANK[ev.status] > RANK[existing.status] && !(existing.status === "COMPLETED" || existing.status === "CANCELLED");

  if (forward) {
    record.status = ev.status;
    if (ev.status !== "CANCELLED" && !record.acceptedAt) record.acceptedAt = at;
    if (ev.status === "COMPLETED" && !record.completedAt) record.completedAt = at;
  }
  if (ev.driverId && !record.driverId) record.driverId = ev.driverId;
  if (!record.customerId && ctx.customerId) record.customerId = ctx.customerId;
  if (!record.customerTelegramId && ev.customerTelegramId) record.customerTelegramId = ev.customerTelegramId;

  const changed = JSON.stringify(record) !== JSON.stringify(existing);
  return { record, changed };
}
