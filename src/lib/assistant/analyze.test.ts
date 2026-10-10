import { describe, expect, it } from "vitest";
import type { Driver, Order } from "../types";
import { customerSnapshot, factSheet, managerSnapshot } from "./analyze";
import { matchIntent } from "./intents";

const NOW = new Date("2026-10-11T08:00:00Z");
const ago = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();
const order = (o: Partial<Order>): Order => ({ id: "x", deviceId: "dev", deviceOrderId: 1, address: "C-12, Saket", weightKg: 5, status: "COMPLETED", paymentStatus: "PAID", amountDue: 250, createdAt: ago(5), ...o }) as Order;
const driver = (d: Partial<Driver>): Driver => ({ id: "d", tenantId: "t", name: "Ravi Kumar", phone: "+919800000000", status: "AVAILABLE", maxJobs: 3, payType: "TRIP", monthlySalary: 0, ...d }) as Driver;
const TENANT = { pricePerKg: 50, turnaroundHours: 24, delivers: true };

describe("advice numbers for a manager", () => {
  const drivers = [driver({ telegramChatId: "1" }), driver({ id: "d2", name: "Amit", telegramChatId: "2", status: "ON_JOB", maxJobs: 2 })];
  const orders = [
    order({ deviceOrderId: 1, driverId: "1", createdAt: ago(3), acceptedAt: ago(2.5), completedAt: ago(2) }),
    order({ deviceOrderId: 2, driverId: "2", createdAt: ago(30), acceptedAt: ago(29), completedAt: ago(28) }),
    order({ deviceOrderId: 3, driverId: "2", status: "ACCEPTED", createdAt: ago(1), acceptedAt: ago(0.5) }),
    order({ deviceOrderId: 4, status: "PENDING", createdAt: ago(0.2) }),
    order({ deviceOrderId: 5, paymentStatus: "UNPAID", amountDue: 300, driverId: "1", createdAt: ago(100), completedAt: ago(99) }),
  ];
  const snap = managerSnapshot(orders, drivers, TENANT, NOW);

  it("works out workload and waiting", () => {
    expect(snap.facts["drivers on duty now"]).toBe(2);
    expect(snap.facts["orders waiting for a driver now"]).toBe(1);
    expect(snap.facts["orders in the last 7 days"]).toBe(5);
    expect(snap.facts["unpaid bills"]).toBe("1 worth ₹300");
    expect(snap.facts["Driver 2"]).toBe("on a job, 1 job now (limit 2), 0 today, 1 in 7 days (0.1/day)");
  });

  it("shows real names to the manager but never sends names, phones or addresses to the AI", () => {
    expect(snap.rows).toContainEqual(["Amit", "1/2 now · 0 today · 1 this week"]);
    const sheet = factSheet(snap.facts);
    for (const secret of ["Ravi", "Amit", "+9198", "Saket"]) expect(sheet).not.toContain(secret);
  });
});

describe("advice numbers for a customer", () => {
  it("explains bills from weights, credit and the driver's weigh-in", () => {
    const snap = customerSnapshot(
      [order({ deviceOrderId: 7, weightKg: 5.4, amountDue: 200, creditApplied: 70, weightSource: "driver", reportedWeightKg: 5.2, weighedKg: 5.4 }), order({ deviceOrderId: 6, weightKg: 4, amountDue: 200, createdAt: ago(200) })],
      50,
      { left: 230, expired: false },
    );
    expect(snap.facts["last bills, newest first"]).toBe("#7: 5.4 kg, ₹200 after ₹70 credit (basket said 5.2 kg, driver weighed 5.4 kg); #6: 4 kg, ₹200");
    expect(snap.facts["basket credit left (₹)"]).toBe(230);
  });
});

describe("advice questions reach the AI, not a fixed report", () => {
  it("doesn't match a rule", () => {
    expect(matchIntent("should i add a driver are my driver overworking", "MANAGER")).toBeNull();
    expect(matchIntent("are my drivers overworked", "MANAGER")).toBeNull();
    expect(matchIntent("why is my bill higher this time", "CUSTOMER")).toBeNull();
  });
});
