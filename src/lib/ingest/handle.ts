import { createHash, timingSafeEqual } from "node:crypto";
import { mergeOrder, orderKey, parsePayload, type HeartbeatEvent, type OrderEvent, type OrderRecord } from "./core";

// Storage-agnostic ingest pipeline: authenticate → parse → merge → persist.
// Production uses SupabaseStore; tests use an in-memory store.

export interface DeviceFields {
  weightKg?: number;
  targetKg?: number;
  rssi?: number;
  address?: string;
  ownerTelegramId?: string;
  fwVersion?: string;
}

export interface StoredOrder extends OrderRecord {
  updatedAt: string;
}

export interface IngestStore {
  getDeviceKeyHash(deviceId: string): Promise<string | undefined>;
  findCustomerIdByTelegram(telegramId: string): Promise<string | undefined>;
  getPricePerKg(tenantId: string): Promise<number | undefined>;
  getOrder(id: string): Promise<StoredOrder | undefined>;
  /** Inserts, or updates only if updatedAt still equals prevUpdatedAt. Returns false on a concurrent write. */
  saveOrder(record: OrderRecord, now: string, prevUpdatedAt: string | undefined): Promise<boolean>;
  appendEvent(e: { orderId: string; deviceId: string; type: string; at: string; payload: unknown }): Promise<void>;
  touchDevice(deviceId: string, tenantId: string, now: string, fields: DeviceFields): Promise<void>;
}

export interface IngestConfig {
  bridgeKey?: string;
  tenantId: string;
  defaultPricePerKg: number;
}

export interface IngestRequest {
  method: string;
  deviceKey: string | null;
  bodyText: string;
}

export interface IngestResponse {
  status: number;
  body: Record<string, unknown>;
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Compare fixed-length digests so timing doesn't leak key length or prefix.
const safeEqual = (a: string, b: string) => timingSafeEqual(Buffer.from(sha256(a)), Buffer.from(sha256(b)));

type Caller = { trusted: true } | { trusted: false; deviceId: string };

async function authenticate(
  store: IngestStore,
  cfg: IngestConfig,
  key: string | null,
  deviceIdHint: string | undefined,
): Promise<Caller | null> {
  if (!key) return null;
  if (cfg.bridgeKey && safeEqual(key, cfg.bridgeKey)) return { trusted: true };
  if (!deviceIdHint) return null;
  const hash = await store.getDeviceKeyHash(deviceIdHint);
  return hash && safeEqual(sha256(key), hash) ? { trusted: false, deviceId: deviceIdHint } : null;
}

async function applyOrder(store: IngestStore, cfg: IngestConfig, ev: OrderEvent, now: string, raw: unknown) {
  const [price, customerId] = await Promise.all([
    store.getPricePerKg(cfg.tenantId),
    ev.customerTelegramId ? store.findCustomerIdByTelegram(ev.customerTelegramId) : undefined,
  ]);
  const id = orderKey(ev.deviceId, ev.deviceOrderId);

  // Optimistic concurrency: retry if another request changed the order between read and write.
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await store.getOrder(id);
    const { record, changed } = mergeOrder(existing, ev, {
      now,
      tenantId: cfg.tenantId,
      pricePerKg: price ?? cfg.defaultPricePerKg,
      customerId,
    });
    if (!changed) return { id, status: record.status, changed: false };
    if (!(await store.saveOrder(record, now, existing?.updatedAt))) continue;

    await store.appendEvent({ orderId: id, deviceId: ev.deviceId, type: ev.status, at: ev.at ?? now, payload: raw });
    return { id, status: record.status, changed: true };
  }
  throw new Error("Order update conflicted repeatedly");
}

export async function handleIngest(req: IngestRequest, store: IngestStore, cfg: IngestConfig): Promise<IngestResponse> {
  if (req.method !== "POST") return { status: 405, body: { error: "Method not allowed" } };

  let body: unknown;
  try {
    body = JSON.parse(req.bodyText);
  } catch {
    return { status: 400, body: { error: "Invalid JSON" } };
  }

  const deviceIdHint =
    body && typeof body === "object" && "deviceId" in body && typeof body.deviceId === "string" ? body.deviceId : undefined;
  const caller = await authenticate(store, cfg, req.deviceKey, deviceIdHint);
  if (!caller) return { status: 401, body: { error: "Unauthorized" } };

  const parsed = parsePayload(body, { trusted: caller.trusted });
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const ev = parsed.value;

  // A device key only authorises that device's own data; legacy (no deviceId) payloads need the bridge key.
  if (!caller.trusted && caller.deviceId !== ev.deviceId) return { status: 403, body: { error: "Forbidden" } };

  const now = new Date().toISOString();
  if (ev.kind === "heartbeat") {
    await store.touchDevice(ev.deviceId, cfg.tenantId, now, ev satisfies HeartbeatEvent);
    return { status: 200, body: { ok: true, deviceId: ev.deviceId } };
  }

  // Device row first: orders reference it by foreign key.
  await store.touchDevice(ev.deviceId, cfg.tenantId, now, {
    address: ev.address,
    ownerTelegramId: ev.customerTelegramId,
    fwVersion: ev.fwVersion,
  });
  const result = await applyOrder(store, cfg, ev, now, body);
  return { status: 200, body: { ok: true, ...result } };
}
