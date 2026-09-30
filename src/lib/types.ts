// Domain model — mirrors the Postgres schema in supabase/migrations (snake_case there, camelCase here).
// Optional fields are nullable columns: e.g. a firmware v1 basket never reports RSSI or target weight.

export type OrderStatus = "PENDING" | "ACCEPTED" | "COMPLETED" | "CANCELLED";
export type PaymentStatus = "UNPAID" | "PENDING" | "PAID" | "REFUNDED";
export type DriverStatus = "AVAILABLE" | "ON_JOB" | "OFFLINE";
export type Role = "CUSTOMER" | "MANAGER";

export interface Tenant {
  id: string;
  name: string;
  pricePerKg: number;
  currency: string;
}

export interface Customer {
  id: string; // Supabase Auth user id
  tenantId: string;
  email?: string;
  name?: string;
  telegramId?: string; // == ownerChatId stored on the ESP32
}

export interface Device {
  deviceId: string; // ESP32 MAC address, or legacy-<chatId> for firmware v1
  tenantId: string;
  ownerTelegramId?: string;
  customerId?: string;
  address?: string;
  area?: string;
  targetKg?: number;
  lastWeightKg?: number;
  lastSeenAt?: string; // ISO timestamp of the last payload from this basket
  firmwareVersion?: string;
  wifiRssi?: number;
}

export interface Driver {
  id: string;
  tenantId: string;
  name: string;
  telegramChatId: string; // matches Order.driverId
  status: DriverStatus;
}

export interface Order {
  id: string; // `${deviceId}#${deviceOrderId}` — order numbers repeat across baskets
  deviceOrderId: number;
  deviceId: string;
  tenantId: string;
  customerTelegramId?: string;
  customerId?: string;
  driverId?: string; // driver's Telegram chat ID
  address: string;
  weightKg: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus; // server-owned; device payloads never overwrite it
  amountDue: number;
  createdAt: string; // when the order was placed (orders.placed_at)
  acceptedAt?: string;
  completedAt?: string;
}
