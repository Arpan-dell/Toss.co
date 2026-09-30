import type { Customer, Device, Driver, Order, Tenant } from "./types";

// Deterministic mock dataset for Phase A. Replaced by Amplify Data in Phase B/C.
// Anchored to a fixed "now" so the UI is stable across reloads.
export const MOCK_NOW = new Date("2026-09-30T10:30:00+05:30");

export const tenant: Tenant = {
  id: "tenant-delhi-01",
  name: "Toss Delhi",
  pricePerKg: 80,
  currency: "INR",
};

export const DEMO_CUSTOMER_ID = "cust-001";

export const customers: Customer[] = [
  { id: "cust-001", tenantId: tenant.id, email: "demo@toss.co", name: "Demo Customer", telegramId: "1000000001" },
  { id: "cust-002", tenantId: tenant.id, email: "aarav@example.com", name: "Aarav Mehta", telegramId: "5011223344" },
  { id: "cust-003", tenantId: tenant.id, email: "diya@example.com", name: "Diya Kapoor", telegramId: "5022334455" },
  { id: "cust-004", tenantId: tenant.id, email: "kabir@example.com", name: "Kabir Singh", telegramId: "5033445566" },
  { id: "cust-005", tenantId: tenant.id, email: "meera@example.com", name: "Meera Nair", telegramId: "5044556677" },
  { id: "cust-006", tenantId: tenant.id, email: "rohan@example.com", name: "Rohan Gupta" }, // not yet linked to Telegram
];

export const drivers: Driver[] = [
  { id: "drv-01", tenantId: tenant.id, name: "Vikram", telegramChatId: "6100000001", status: "ON_JOB" },
  { id: "drv-02", tenantId: tenant.id, name: "Suresh", telegramChatId: "6100000002", status: "AVAILABLE" },
  { id: "drv-03", tenantId: tenant.id, name: "Imran", telegramChatId: "6100000003", status: "OFFLINE" },
];

const minutesAgo = (m: number) => new Date(MOCK_NOW.getTime() - m * 60_000).toISOString();

export const devices: Device[] = [
  { deviceId: "24:6F:28:A1:B2:01", tenantId: tenant.id, ownerTelegramId: "1000000001", customerId: "cust-001", address: "Apt 4B, Smart Laundry HQ, Delhi", area: "Connaught Place", targetKg: 5, lastWeightKg: 1.2, lastSeenAt: minutesAgo(2), firmwareVersion: "1.0.0", wifiRssi: -58 },
  { deviceId: "24:6F:28:A1:B2:02", tenantId: tenant.id, ownerTelegramId: "5011223344", customerId: "cust-002", address: "C-12, Hauz Khas, Delhi", area: "Hauz Khas", targetKg: 6, lastWeightKg: 4.9, lastSeenAt: minutesAgo(4), firmwareVersion: "1.0.0", wifiRssi: -67 },
  { deviceId: "24:6F:28:A1:B2:03", tenantId: tenant.id, ownerTelegramId: "5022334455", customerId: "cust-003", address: "Flat 302, Saket, Delhi", area: "Saket", targetKg: 5, lastWeightKg: 5.4, lastSeenAt: minutesAgo(1), firmwareVersion: "1.0.0", wifiRssi: -49 },
  { deviceId: "24:6F:28:A1:B2:04", tenantId: tenant.id, ownerTelegramId: "5033445566", customerId: "cust-004", address: "B-7, Rajouri Garden, Delhi", area: "Rajouri Garden", targetKg: 8, lastWeightKg: 2.1, lastSeenAt: minutesAgo(46), firmwareVersion: "0.9.2", wifiRssi: -81 },
  { deviceId: "24:6F:28:A1:B2:05", tenantId: tenant.id, ownerTelegramId: "5044556677", customerId: "cust-005", address: "House 19, Dwarka Sec 6, Delhi", area: "Dwarka", targetKg: 7, lastWeightKg: 0.3, lastSeenAt: minutesAgo(3), firmwareVersion: "1.0.0", wifiRssi: -62 },
];

// Small seeded PRNG so the dataset is identical on every load.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Relative chance of a basket filling on each weekday (Sun..Sat): weekends peak.
const WEEKDAY_WEIGHT = [1.6, 0.9, 0.7, 0.8, 0.8, 1.0, 1.7];

function buildOrders(): Order[] {
  const rand = mulberry32(42);
  const orders: Order[] = [];
  const DAYS = 84; // 12 weeks of history

  for (const device of devices) {
    let nextId = 100; // mirrors firmware: every basket counts from 100
    const customer = customers.find((c) => c.id === device.customerId)!;

    for (let d = DAYS; d >= 1; d--) {
      const day = new Date(MOCK_NOW.getTime() - d * 86_400_000);
      const p = 0.16 * WEEKDAY_WEIGHT[day.getDay()];
      if (rand() > p) continue;

      day.setHours(7 + Math.floor(rand() * 13), Math.floor(rand() * 60), 0, 0);
      const weightKg = Math.round((device.targetKg + rand() * 1.4) * 100) / 100;
      const acceptedAt = new Date(day.getTime() + (8 + rand() * 40) * 60_000);
      const completedAt = new Date(acceptedAt.getTime() + (30 + rand() * 150) * 60_000);
      const driver = drivers[Math.floor(rand() * drivers.length)];

      orders.push({
        id: `${device.deviceId}#${nextId}`,
        deviceOrderId: nextId++,
        deviceId: device.deviceId,
        tenantId: tenant.id,
        customerTelegramId: device.ownerTelegramId ?? "",
        customerId: customer.id,
        driverId: driver.id,
        address: device.address,
        weightKg,
        status: "COMPLETED",
        paymentStatus: d <= 3 && rand() < 0.6 ? "UNPAID" : "PAID",
        amountDue: Math.round(weightKg * tenant.pricePerKg),
        createdAt: day.toISOString(),
        acceptedAt: acceptedAt.toISOString(),
        completedAt: completedAt.toISOString(),
      });
    }

    // Live orders happening "today"
    const live: Record<string, { status: "PENDING" | "ACCEPTED"; minsAgo: number; driverId?: string }> = {
      "24:6F:28:A1:B2:01": { status: "ACCEPTED", minsAgo: 38, driverId: "drv-01" },
      "24:6F:28:A1:B2:03": { status: "PENDING", minsAgo: 6 },
      "24:6F:28:A1:B2:02": { status: "PENDING", minsAgo: 21 },
    };
    const l = live[device.deviceId];
    if (l) {
      const weightKg = Math.round((device.targetKg + 0.3) * 100) / 100;
      orders.push({
        id: `${device.deviceId}#${nextId}`,
        deviceOrderId: nextId++,
        deviceId: device.deviceId,
        tenantId: tenant.id,
        customerTelegramId: device.ownerTelegramId ?? "",
        customerId: customer.id,
        driverId: l.driverId,
        address: device.address,
        weightKg,
        status: l.status,
        paymentStatus: "UNPAID",
        amountDue: Math.round(weightKg * tenant.pricePerKg),
        createdAt: minutesAgo(l.minsAgo),
        acceptedAt: l.status === "ACCEPTED" ? minutesAgo(l.minsAgo - 9) : undefined,
      });
    }
  }

  // Guarantee the demo customer has one completed-but-unpaid invoice to exercise the Pay flow.
  const demoCompleted = orders.filter((o) => o.customerId === DEMO_CUSTOMER_ID && o.status === "COMPLETED");
  const latest = demoCompleted[demoCompleted.length - 1];
  if (latest) latest.paymentStatus = "UNPAID";

  return orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const orders: Order[] = buildOrders();
