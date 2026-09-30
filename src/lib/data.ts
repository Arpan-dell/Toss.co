import "server-only";
import * as mock from "./mock-data";
import type { Customer, Device, Driver, Order } from "./types";

// Data access layer. Every page reads through these functions, so Phase B/C only
// has to swap the implementations to Amplify Data (generateServerClientUsingCookies).

export const DEVICE_ONLINE_WINDOW_MS = 10 * 60_000;

export function now(): Date {
  return mock.MOCK_NOW;
}

export async function getTenant() {
  return mock.tenant;
}

export async function getCustomer(id: string): Promise<Customer | undefined> {
  return mock.customers.find((c) => c.id === id);
}

export async function listCustomers(): Promise<Customer[]> {
  return mock.customers;
}

export async function listOrdersForCustomer(customerId: string): Promise<Order[]> {
  return mock.orders.filter((o) => o.customerId === customerId);
}

export async function listOrders(filter?: { status?: Order["status"]; q?: string }): Promise<Order[]> {
  let result = mock.orders;
  if (filter?.status) result = result.filter((o) => o.status === filter.status);
  if (filter?.q) {
    const q = filter.q.toLowerCase();
    result = result.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        o.address.toLowerCase().includes(q) ||
        o.customerTelegramId.includes(q),
    );
  }
  return result;
}

export async function listActiveOrders(): Promise<Order[]> {
  return mock.orders.filter((o) => o.status === "PENDING" || o.status === "ACCEPTED");
}

export async function listDevices(): Promise<Device[]> {
  return mock.devices;
}

export async function getDeviceForCustomer(customerId: string): Promise<Device | undefined> {
  return mock.devices.find((d) => d.customerId === customerId);
}

export async function listDrivers(): Promise<Driver[]> {
  return mock.drivers;
}

export function isDeviceOnline(device: Device): boolean {
  return now().getTime() - new Date(device.lastSeenAt).getTime() < DEVICE_ONLINE_WINDOW_MS;
}
