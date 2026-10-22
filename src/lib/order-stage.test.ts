import { describe, expect, it } from "vitest";
import { orderStage } from "./order-stage";

const now = new Date("2026-10-23T10:00:00Z");
const day = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

describe("where an order really is", () => {
  it("before and during pickup", () => {
    expect(orderStage({ status: "PENDING" }, now).key).toBe("waiting");
    expect(orderStage({ status: "ACCEPTED" }, now).key).toBe("enroute");
    expect(orderStage({ status: "CANCELLED" }, now).key).toBe("cancelled");
  });

  it("after pickup: weighing, washing, ready, delivery", () => {
    expect(orderStage({ status: "COMPLETED", weighPending: true, completedAt: day(0) }, now).label).toBe("To weigh");
    expect(orderStage({ status: "COMPLETED", completedAt: day(1) }, now).label).toBe("In the wash");
    expect(orderStage({ status: "COMPLETED", completedAt: day(1), readyAt: day(0) }, now).label).toBe("Ready to collect");
    expect(orderStage({ status: "COMPLETED", completedAt: day(1), readyAt: day(0), deliveryStatus: "WAITING" }, now).label).toBe("Ready · needs a driver");
    expect(orderStage({ status: "COMPLETED", completedAt: day(1), readyAt: day(0), deliveryStatus: "OUT" }, now).label).toBe("Out for delivery");
    expect(orderStage({ status: "COMPLETED", completedAt: day(2), readyAt: day(1), deliveryStatus: "DELIVERED" }, now).label).toBe("Delivered");
    expect(orderStage({ status: "COMPLETED", completedAt: day(2), readyAt: day(1), deliveryStatus: "COLLECTED" }, now).label).toBe("Collected");
  });

  it("an old order never marked ready is history, not stuck in the wash", () => {
    expect(orderStage({ status: "COMPLETED", completedAt: day(30) }, now)).toMatchObject({ key: "old", label: "Picked up" });
  });
});
