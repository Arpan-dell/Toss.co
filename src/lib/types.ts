// Domain model — mirrors the Postgres schema in supabase/migrations (snake_case there, camelCase here).
// Optional fields are nullable columns: e.g. a firmware v1 basket never reports RSSI or target weight.

export type OrderStatus = "PENDING" | "ACCEPTED" | "COMPLETED" | "CANCELLED";
export type PaymentStatus = "UNPAID" | "PENDING" | "PAID" | "REFUNDED";
export type DriverStatus = "AVAILABLE" | "ON_JOB" | "OFFLINE";
export type Role = "CUSTOMER" | "MANAGER" | "OWNER";

// A laundry business. Customers join it by entering its joinCode (the "Business ID").
export interface Tenant {
  id: string;
  name: string;
  pricePerKg: number;
  currency: string;
  joinCode: string;
  managerId?: string;
  upiId?: string; // where customers pay this business
  upiName?: string;
  storeAddress?: string; // where drivers deliver; the last stop of every route
  storeLocated?: boolean; // the store address was found on the map
  storeLat?: number;
  storeLng?: number;
  serviceRadiusKm: number; // the business picks up within this distance of its store (1-20 km)
  listed: boolean; // shown in the public "Find a laundry" directory
  weighAtPickup: boolean; // drivers must enter the scale reading when they pick up
  sortWhites: boolean; // drivers bag and weigh whites and coloured clothes separately (needs weighAtPickup)
  otherCostPerKg: number; // water, power, labour per kg washed (for profit)
  driverPayPerPickup: number; // ₹ a driver earns per pickup
  driverPayPerKm: number; // plus ₹ per km from the store to the basket
  turnaroundHours: number; // promised time from pickup to ready
  googleReviewUrl?: string; // happy customers are pointed here
  parentTenantId?: string; // set on an extra branch: the manager's main business (migration 0024)
  planStatus: "TRIAL" | "ACTIVE" | "SUSPENDED";
  trialEndsAt?: string;
  paidUntil?: string;
  winbackEnabled: boolean; // offer a discount to customers who stop ordering
  winbackDays: number; // …after this many days without a pickup
  winbackPct: number; // …of this many percent off their next pickup
  closureRequestedAt?: string; // the manager asked Toss to remove the business
  closureReason?: string;
  autopilot: {
    enabled: boolean; // "Automate everything"
    staffing: boolean;
    winback: boolean;
    nudges: boolean;
    pricing: boolean;
    maxDiscount: number;
    priceMin?: number;
    priceMax?: number;
    priceStepPct: number;
  };
}

export type AiActionStatus = "SUGGESTED" | "EXECUTED" | "DISMISSED" | "FAILED" | "EXPIRED";
export interface AiAction {
  id: number;
  type: "driver_alert" | "set_max_jobs" | "winback_offer" | "payment_reminder" | "basket_nudge" | "price_change";
  label: string;
  reason: string;
  impact: string;
  priority: 1 | 2 | 3;
  status: AiActionStatus;
  auto: boolean;
  result?: string;
  message?: string;
  createdAt: string;
  decidedAt?: string;
}

// A discount waiting for a customer's next pickup (e.g. a win-back offer).
export interface CustomerOffer {
  id: number;
  tenantId: string;
  percent: number;
  expiresAt: string;
}

export interface PlatformSettings {
  monthlyPrice: number;
  trialDays: number;
  ownerUpiId?: string; // where businesses pay their Toss subscription
  ownerUpiName: string;
  discount3m: number; // % off a subscription paid 3–5 months at once
  discount6m: number; // 6–11 months
  discount12m: number; // 12 months
  // basket credits (migration 0020)
  basketPrice: number; // what a Toss basket sells for
  basketCredit: number; // laundry credit that comes with it
  creditPerKg: number; // credit taken per kg of a pickup
  creditMaxPct: number; // at most this % of any one bill
  creditTossSharePct: number; // Toss's share of each credit used, given back as subscription discount
  creditSubMaxPct: number; // at most this % of a subscription payment can be covered by it
  creditValidDays: number;
  branchPrice: number; // monthly Pro price of each extra branch (the main business pays monthlyPrice)
}

export interface SubscriptionPayment {
  id: number;
  tenantId: string;
  months: number;
  amount: number;
  paymentRef: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  reviewedAt?: string;
}

export interface Customer {
  id: string; // Supabase Auth user id
  customerCode: string; // the "Customer ID" shown to the customer
  tenantId?: string; // set once they enter a Business ID
  email?: string;
  name?: string;
  phone?: string; // E.164 mobile number, unique: the customer's identity
  phoneVerified: boolean; // Telegram confirmed this number belongs to the linked account
  telegramId?: string; // == ownerChatId stored on the ESP32
}

export interface Device {
  deviceId: string; // ESP32 MAC address, or legacy-<chatId> for firmware v1
  tenantId?: string;
  ownerTelegramId?: string;
  customerId?: string;
  address?: string;
  area?: string;
  targetKg?: number;
  lastWeightKg?: number;
  lastSeenAt?: string; // ISO timestamp of the last payload from this basket
  firmwareVersion?: string;
  wifiRssi?: number;
  accountId?: string; // the business account (PG, hostel) whose bill this basket's pickups go on
}

export interface Driver {
  id: string;
  tenantId: string;
  name: string;
  phone?: string; // E.164; the manager adds drivers by number
  telegramChatId?: string; // matches Order.driverId; set when the driver shares their number with the driver bot
  status: DriverStatus;
  location?: { lat: number; lng: number };
  locationAt?: string; // when the driver bot last received their (live) location
  maxJobs: number;
}

export interface Order {
  id: string; // `${deviceId}#${deviceOrderId}` — order numbers repeat across baskets
  deviceOrderId: number;
  deviceId: string;
  tenantId?: string; // unknown until the basket's owner joins a business
  customerTelegramId?: string;
  customerId?: string;
  driverId?: string; // driver's Telegram chat ID
  address: string;
  weightKg: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus; // server-owned; device payloads never overwrite it
  paymentMethod?: "UPI" | "CASH" | "OTHER";
  paymentRef?: string; // UPI transaction reference the customer submitted
  paymentReportedAt?: string;
  paymentConfirmedAt?: string;
  amountDue: number;
  invoiceNumber?: string; // set once the order is paid and its invoice is issued
  discountPct?: number; // a customer offer applied to this pickup
  amountBeforeDiscount?: number;
  amountGross?: number; // price before basket credit
  creditApplied?: number; // basket credit taken off this bill (amountDue is after it)
  readyBy?: string; // promised: pickup completed + the laundry's turnaround
  readyAt?: string; // the laundry marked it ready
  rating?: number; // 1-5 from the customer
  ratingComment?: string;
  ratedAt?: string;
  accountId?: string; // on a business account's monthly bill instead of paid per pickup
  whitesKg?: number; // set when the driver bagged whites and coloured clothes separately (weightKg = their sum)
  colouredKg?: number;
  pickupPhotoAt?: string; // the driver sent a photo of the bag at pickup (shown via /admin/orders/[id]/photo)
  reportedWeightKg?: number; // what the basket said, kept once the weight is confirmed at pickup
  weighedKg?: number; // the driver's (or manager's) scale reading
  weightSource?: "driver" | "basket" | "manager"; // where the billed weight came from
  createdAt: string; // when the order was placed (orders.placed_at)
  acceptedAt?: string;
  completedAt?: string;
}

// A PG, hostel or office billed monthly for all its baskets (migration 0024).
export interface BusinessAccount {
  id: string;
  name: string;
  contactName?: string;
  phone?: string; // E.164
  email?: string;
  pricePerKg?: number; // its own rate; the laundry's price when unset
  createdAt: string;
}
