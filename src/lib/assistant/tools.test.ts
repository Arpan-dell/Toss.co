import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Driver, Order } from "../types";

// The assistant's tools with the data layer mocked: what each role is told, and what actions come back.
const NOW = new Date("2026-10-11T08:00:00Z"); // 13:30 in India
const order = (o: Partial<Order>): Order => ({ id: "dev#1", deviceId: "dev", deviceOrderId: 1, address: "", weightKg: 5, status: "PENDING", paymentStatus: "UNPAID", amountDue: 0, createdAt: NOW.toISOString(), ...o }) as Order;
const driver = (d: Partial<Driver>): Driver => ({ id: "d1", tenantId: "t1", name: "Ravi Kumar", status: "AVAILABLE", maxJobs: 3, payType: "TRIP", monthlySalary: 0, ...d }) as Driver;

const data = {
  orders: [] as Order[],
  drivers: [] as Driver[],
};
vi.mock("../data", () => ({
  now: () => NOW,
  listOrders: async () => data.orders,
  listOrdersForCustomer: async () => data.orders,
  listDrivers: async () => data.drivers,
  listDevices: async () => [],
  listSupplies: async () => [],
  listTenants: async () => [],
  listSubscriptionPayments: async () => [],
  getTenantById: async () => ({ id: "t1", name: "Fresh", planStatus: "ACTIVE", planUntil: "2027-01-01T00:00:00Z", trialEndsAt: "2026-01-01T00:00:00Z", storeLocated: true, delivers: true, upiId: "fresh@upi" }),
  getCustomer: async () => ({ id: "c1", tenantId: "t1" }),
  getDeviceForCustomer: async () => ({ deviceId: "dev", targetKg: 5, lastWeightKg: 3.4, lastSeenAt: new Date(NOW.getTime() - 5 * 60_000).toISOString() }),
  getCustomerCredit: async () => ({ granted: 500, used: 120, left: 380, expiresAt: "2026-11-30T00:00:00Z", expired: false }),
}));

const { runIntent } = await import("./tools");
const manager = { userId: "u1", role: "MANAGER" as const, tenantId: "t1" };
const customer = { userId: "c1", role: "CUSTOMER" as const };

beforeEach(() => {
  data.orders = [];
  data.drivers = [];
});

describe("assistant tools", () => {
  it("returns client actions for theme, password and pages", async () => {
    expect((await runIntent({ tool: "theme", mode: "dark" }, customer)).action).toEqual({ type: "theme", mode: "dark" });
    expect((await runIntent({ tool: "password", newPassword: "Abc@1234" }, customer)).action).toEqual({ type: "password", newPassword: "Abc@1234" });
    expect((await runIntent({ tool: "go", href: "/app/orders", label: "Order history" }, customer)).action).toEqual({ type: "navigate", href: "/app/orders" });
  });

  it("tells a customer how full the basket is", async () => {
    const r = await runIntent({ tool: "basket" }, customer);
    expect(r.text).toBe("Your basket is 68% full: 3.4 kg of 5.0 kg. It books a pickup by itself at 5.0 kg.");
    expect(r.rows).toContainEqual(["Last reading", "5 min ago"]);
  });

  it("adds up what a customer owes", async () => {
    data.orders = [order({ deviceOrderId: 7, status: "COMPLETED", amountDue: 270 }), order({ deviceOrderId: 8, status: "COMPLETED", amountDue: 130 }), order({ deviceOrderId: 9, status: "COMPLETED", paymentStatus: "PAID", amountDue: 99 })];
    const r = await runIntent({ tool: "orders", filter: "unpaid" }, customer);
    expect(r.text).toBe("You owe ₹400 for 2 pickups.");
  });

  it("says where a driver is, with a map link and their jobs", async () => {
    data.drivers = [driver({ telegramChatId: "55", status: "ON_JOB", location: { lat: 28.52, lng: 77.21 }, locationAt: new Date(NOW.getTime() - 4 * 60_000).toISOString() })];
    data.orders = [order({ deviceOrderId: 104, status: "ACCEPTED", driverId: "55" })];
    const r = await runIntent({ tool: "driver", name: "ravi" }, manager);
    expect(r.text).toBe("Here's where Ravi Kumar is now:");
    expect(r.rows).toContainEqual(["Jobs now", "#104"]);
    expect(r.links?.[0]).toEqual({ label: "Open in Google Maps", href: "https://www.google.com/maps?q=28.52,77.21", external: true });
  });

  it("warns when a driver's location is old, and handles unknown names", async () => {
    data.drivers = [driver({ location: { lat: 1, lng: 2 }, locationAt: new Date(NOW.getTime() - 3 * 3600_000).toISOString() })];
    expect((await runIntent({ tool: "driver", name: "ravi" }, manager)).text).toBe("Ravi Kumar's last shared location is from 3 h ago, so they may have moved since.");
    expect((await runIntent({ tool: "driver", name: "suresh" }, manager)).text).toBe('I can\'t find a driver called "suresh".');
  });

  it("gives a manager today's summary", async () => {
    data.orders = [order({ deviceOrderId: 1, status: "PENDING" }), order({ deviceOrderId: 2, status: "COMPLETED", amountDue: 250, completedAt: NOW.toISOString() })];
    data.drivers = [driver({}), driver({ id: "d2", name: "Amit", status: "OFFLINE" })];
    const r = await runIntent({ tool: "overview" }, manager);
    expect(r.text).toBe("Fresh, today so far:");
    expect(r.rows).toContainEqual(["Waiting for a driver", "1"]);
    expect(r.rows).toContainEqual(["Unpaid", "1 · ₹250"]);
    expect(r.rows).toContainEqual(["Drivers on duty", "1 of 2"]);
  });
});
