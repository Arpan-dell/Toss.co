import { describe, expect, it } from "vitest";
import { mergeOrder, parsePayload, type OrderEvent } from "./core";

const ctx = { now: "2026-10-01T10:00:00.000Z", tenantId: "t1", pricePerKg: 80 };

// Exactly what firmware v1 sends today (see sendOrderToGoogle in headless_laundry.ino).
const legacy = {
  orderId: 104,
  customerId: "1000000001",
  address: "Apt 4B, Delhi",
  weight: 5.27,
  status: "PENDING",
  paymentStatus: "UNPAID",
};

function orderEvent(overrides: Partial<OrderEvent> = {}): OrderEvent {
  const r = parsePayload(legacy, { trusted: false });
  if (!r.ok || r.value.kind !== "order") throw new Error("fixture");
  return { ...r.value, ...overrides };
}

describe("parsePayload", () => {
  it("maps a legacy firmware payload to a legacy device", () => {
    const r = parsePayload(legacy, { trusted: false });
    expect(r).toEqual({
      ok: true,
      value: expect.objectContaining({
        kind: "order",
        deviceId: "legacy-1000000001",
        deviceOrderId: 104,
        status: "PENDING",
        weightKg: 5.27,
        customerTelegramId: "1000000001",
      }),
    });
  });

  it("ignores paymentStatus from the device", () => {
    const r = parsePayload({ ...legacy, paymentStatus: "PAID" }, { trusted: true });
    expect(r.ok && "paymentStatus" in r.value).toBe(false);
  });

  it("accepts v2 order and heartbeat payloads", () => {
    const order = parsePayload(
      { type: "order", deviceId: "24:6F:28:A1:B2:01", orderId: 7, status: "accepted", weight: 5, driverId: "6100000001" },
      { trusted: false },
    );
    expect(order.ok && order.value).toMatchObject({ kind: "order", status: "ACCEPTED", driverId: "6100000001" });

    const hb = parsePayload({ type: "heartbeat", deviceId: "24:6F:28:A1:B2:01", weight: 1.2, targetKg: 5, rssi: -61 }, { trusted: false });
    expect(hb.ok && hb.value).toMatchObject({ kind: "heartbeat", weightKg: 1.2, targetKg: 5, rssi: -61 });
  });

  it("only honours a custom timestamp from trusted callers", () => {
    const body = { ...legacy, at: "2026-07-01T08:00:00Z" };
    const untrusted = parsePayload(body, { trusted: false });
    const trusted = parsePayload(body, { trusted: true });
    expect(untrusted.ok && untrusted.value.kind === "order" && untrusted.value.at).toBeUndefined();
    expect(trusted.ok && trusted.value.kind === "order" && trusted.value.at).toBe("2026-07-01T08:00:00.000Z");
  });

  it.each([
    [null, "Body must be a JSON object"],
    [{ ...legacy, weight: -1 }, "Invalid weight"],
    [{ ...legacy, weight: "abc" }, "Invalid weight"],
    [{ ...legacy, orderId: 1.5 }, "Invalid orderId"],
    [{ ...legacy, status: "LOST" }, "Invalid status"],
    [{ ...legacy, customerId: "abc" }, "Invalid customer Telegram ID"],
    [{ type: "order", deviceId: "bad id!", orderId: 1, status: "PENDING", weight: 1 }, "Invalid deviceId"],
    [{ type: "reboot", deviceId: "d1", weight: 1 }, "Unknown payload type"],
  ])("rejects %j", (body, error) => {
    expect(parsePayload(body, { trusted: false })).toEqual({ ok: false, error });
  });
});

describe("mergeOrder", () => {
  it("creates a new order keyed by device + order number, priced server-side", () => {
    const { record, changed } = mergeOrder(undefined, orderEvent(), ctx);
    expect(changed).toBe(true);
    expect(record).toMatchObject({
      id: "legacy-1000000001#104",
      status: "PENDING",
      paymentStatus: "UNPAID",
      amountDue: 422, // 5.27 kg × ₹80
      placedAt: ctx.now,
    });
  });

  it("keeps orders from different baskets apart even with the same order number", () => {
    const a = mergeOrder(undefined, orderEvent({ deviceId: "dev-a" }), ctx).record;
    const b = mergeOrder(undefined, orderEvent({ deviceId: "dev-b" }), ctx).record;
    expect(a.id).not.toBe(b.id);
  });

  it("moves status forward and stamps timestamps once", () => {
    const created = mergeOrder(undefined, orderEvent(), ctx).record;
    const accepted = mergeOrder(created, orderEvent({ status: "ACCEPTED", driverId: "61" }), {
      ...ctx,
      now: "2026-10-01T10:09:00.000Z",
    }).record;
    const done = mergeOrder(accepted, orderEvent({ status: "COMPLETED" }), { ...ctx, now: "2026-10-01T11:00:00.000Z" }).record;
    expect(done).toMatchObject({
      status: "COMPLETED",
      driverId: "61",
      acceptedAt: "2026-10-01T10:09:00.000Z",
      completedAt: "2026-10-01T11:00:00.000Z",
    });
  });

  it("never moves status backwards on a late or retried event", () => {
    const completed = mergeOrder(undefined, orderEvent({ status: "COMPLETED" }), ctx).record;
    const { record, changed } = mergeOrder(completed, orderEvent({ status: "ACCEPTED" }), ctx);
    expect(record.status).toBe("COMPLETED");
    expect(changed).toBe(false);
  });

  it("never lets the device overwrite a paid invoice", () => {
    const paid = { ...mergeOrder(undefined, orderEvent({ status: "ACCEPTED" }), ctx).record, paymentStatus: "PAID" as const };
    const { record } = mergeOrder(paid, orderEvent({ status: "COMPLETED" }), ctx);
    expect(record.paymentStatus).toBe("PAID");
  });

  it("keeps the weight and price fixed at placement", () => {
    const created = mergeOrder(undefined, orderEvent(), ctx).record;
    const { record } = mergeOrder(created, orderEvent({ status: "ACCEPTED", weightKg: 9 }), { ...ctx, pricePerKg: 999 });
    expect(record.weightKg).toBe(5.27);
    expect(record.amountDue).toBe(422);
  });

  it("links the customer once their Telegram account is known", () => {
    const created = mergeOrder(undefined, orderEvent(), ctx).record;
    const { record, changed } = mergeOrder(created, orderEvent(), { ...ctx, customerId: "cognito-sub-1" });
    expect(record.customerId).toBe("cognito-sub-1");
    expect(changed).toBe(true);
  });

  it("uses a trusted backfill timestamp for placement", () => {
    const { record } = mergeOrder(undefined, orderEvent({ at: "2026-07-01T08:00:00.000Z" }), ctx);
    expect(record.placedAt).toBe("2026-07-01T08:00:00.000Z");
  });
});
