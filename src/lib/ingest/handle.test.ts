import { beforeEach, describe, expect, it } from "vitest";
import { handleIngest, sha256, type DeviceFields, type IngestStore, type StoredOrder } from "./handle";

class MemoryStore implements IngestStore {
  devices = new Map<string, DeviceFields & { apiKeyHash?: string; tenantId?: string; lastSeenAt?: string }>();
  customers = new Map<string, { customerId: string; tenantId?: string }>(); // keyed by Telegram ID
  orders = new Map<string, StoredOrder>();
  events: unknown[] = [];

  async getDeviceKeyHash(id: string) {
    return this.devices.get(id)?.apiKeyHash;
  }
  async findCustomerByTelegram(t: string) {
    return this.customers.get(t);
  }
  async getDeviceTenant(id: string) {
    return this.devices.get(id)?.tenantId;
  }
  prices = new Map<string, number>();
  async getPricePerKg(tenantId: string) {
    return this.prices.get(tenantId);
  }
  async getOrder(id: string) {
    const o = this.orders.get(id);
    return o && { ...o };
  }
  async saveOrder(record: StoredOrder | Omit<StoredOrder, "updatedAt">, now: string, prev: string | undefined) {
    const current = this.orders.get(record.id);
    if (current ? current.updatedAt !== prev : prev !== undefined) return false;
    this.orders.set(record.id, { ...record, updatedAt: now });
    return true;
  }
  async appendEvent(e: unknown) {
    this.events.push(e);
  }
  async touchDevice(id: string, tenantId: string | undefined, now: string, f: DeviceFields) {
    const d = this.devices.get(id) ?? {};
    const defined = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined));
    this.devices.set(id, { ...d, ...defined, tenantId: d.tenantId ?? tenantId, lastSeenAt: now });
  }
}

const cfg = { bridgeKey: "bridge-secret", defaultPricePerKg: 80 };
const legacy = { orderId: 104, customerId: "1000000001", address: "Apt 4B", weight: 5.27, status: "PENDING", paymentStatus: "UNPAID" };

let store: MemoryStore;
const send = (body: unknown, deviceKey: string | null = "bridge-secret", method = "POST") =>
  handleIngest({ method, deviceKey, bodyText: typeof body === "string" ? body : JSON.stringify(body) }, store, cfg);

beforeEach(() => {
  store = new MemoryStore();
});

describe("handleIngest", () => {
  it("rejects missing or wrong keys, bad JSON and non-POST requests", async () => {
    expect((await send(legacy, null)).status).toBe(401);
    expect((await send(legacy, "nope")).status).toBe(401);
    expect((await send(legacy, "bridge-secret", "GET")).status).toBe(405);
    expect((await send("{not json")).status).toBe(400);
  });

  it("stores a legacy bridge order and links the known customer", async () => {
    store.customers.set("1000000001", { customerId: "user-123", tenantId: "tenant-1" });
    store.prices.set("tenant-1", 100);
    const res = await send(legacy);
    expect(res).toMatchObject({ status: 200, body: { ok: true, id: "legacy-1000000001#104", changed: true } });
    expect(store.orders.get("legacy-1000000001#104")).toMatchObject({
      status: "PENDING",
      paymentStatus: "UNPAID",
      amountDue: 527, // 5.27 kg at the business's own ₹100/kg
      customerId: "user-123",
      tenantId: "tenant-1",
    });
    expect(store.events).toHaveLength(1);
    expect(store.devices.get("legacy-1000000001")).toMatchObject({ address: "Apt 4B", tenantId: "tenant-1" });
  });

  it("keeps orders from a basket whose owner hasn't joined a business unassigned, at the default price", async () => {
    await send(legacy);
    expect(store.orders.get("legacy-1000000001#104")).toMatchObject({ tenantId: undefined, amountDue: 422 });
    expect(store.devices.get("legacy-1000000001")?.tenantId).toBeUndefined();
  });

  it("assigns the business once the owner joins, without repricing the order", async () => {
    await send(legacy);
    store.customers.set("1000000001", { customerId: "user-123", tenantId: "tenant-9" });
    store.prices.set("tenant-9", 200);
    await send({ ...legacy, status: "ACCEPTED" });
    expect(store.orders.get("legacy-1000000001#104")).toMatchObject({ tenantId: "tenant-9", customerId: "user-123", amountDue: 422 });
  });

  it("files a basket's orders under its business even when the owner isn't linked", async () => {
    store.devices.set("legacy-1000000001", { tenantId: "tenant-5" });
    await send(legacy);
    expect(store.orders.get("legacy-1000000001#104")?.tenantId).toBe("tenant-5");
  });

  it("is idempotent for retried payloads", async () => {
    await send(legacy);
    const again = await send(legacy);
    expect(again.body).toMatchObject({ changed: false });
    expect(store.events).toHaveLength(1);
  });

  it("never lets a later device update reset a paid invoice", async () => {
    await send(legacy);
    store.orders.get("legacy-1000000001#104")!.paymentStatus = "PAID";
    await send({ ...legacy, status: "COMPLETED", paymentStatus: "UNPAID" });
    expect(store.orders.get("legacy-1000000001#104")).toMatchObject({ status: "COMPLETED", paymentStatus: "PAID" });
  });

  it("authenticates a v2 device by its own key and blocks it elsewhere", async () => {
    store.devices.set("dev-a", { apiKeyHash: sha256("device-a-key") });

    const hb = await send({ type: "heartbeat", deviceId: "dev-a", weight: 2.4, rssi: -60 }, "device-a-key");
    expect(hb.status).toBe(200);
    expect(store.devices.get("dev-a")).toMatchObject({ weightKg: 2.4, rssi: -60 });

    expect((await send({ type: "heartbeat", deviceId: "dev-b", weight: 1 }, "device-a-key")).status).toBe(401);
    expect((await send(legacy, "device-a-key")).status).toBe(401);
  });

  it("retries when a concurrent write wins the race", async () => {
    await send(legacy);
    const realSave = store.saveOrder.bind(store);
    let first = true;
    store.saveOrder = async (record, now, prev) => {
      if (first) {
        first = false;
        // Simulate another request updating the row in between.
        const cur = store.orders.get(record.id)!;
        store.orders.set(record.id, { ...cur, updatedAt: "concurrent" });
      }
      return realSave(record, now, prev);
    };
    const res = await send({ ...legacy, status: "ACCEPTED" });
    expect(res.status).toBe(200);
    expect(store.orders.get("legacy-1000000001#104")?.status).toBe("ACCEPTED");
  });
});
