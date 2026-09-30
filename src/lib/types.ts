// Domain model — mirrors the Amplify Data / DynamoDB schema in the TAD (§3).
// Keep these in sync with amplify/data/resource.ts once Phase B lands.

export type OrderStatus = "PENDING" | "ACCEPTED" | "COMPLETED" | "CANCELLED";
export type PaymentStatus = "UNPAID" | "PENDING" | "PAID" | "REFUNDED";
export type DriverStatus = "AVAILABLE" | "ON_JOB" | "OFFLINE";
export type Role = "CUSTOMER" | "MANAGER";

export interface Tenant {
  id: string;
  name: string;
  pricePerKg: number;
  currency: "INR";
}

export interface Customer {
  id: string; // Cognito sub
  tenantId: string;
  email: string;
  name: string;
  telegramId?: string; // == ownerChatId stored on the ESP32
}

export interface Device {
  deviceId: string; // ESP32 MAC address
  tenantId: string;
  ownerTelegramId?: string;
  customerId?: string;
  address: string;
  area: string;
  targetKg: number;
  lastWeightKg: number;
  lastSeenAt: string; // ISO timestamp of last heartbeat
  firmwareVersion: string;
  wifiRssi: number;
}

export interface Driver {
  id: string;
  tenantId: string;
  name: string;
  telegramChatId: string;
  status: DriverStatus;
}

export interface Order {
  id: string; // `${deviceId}#${deviceOrderId}` — device IDs alone collide across baskets
  deviceOrderId: number;
  deviceId: string;
  tenantId: string;
  customerTelegramId: string;
  customerId?: string;
  driverId?: string;
  address: string;
  weightKg: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus; // server-owned; device payloads never overwrite it
  amountDue: number;
  createdAt: string;
  acceptedAt?: string;
  completedAt?: string;
}
