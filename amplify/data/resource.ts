import { a, defineData, type ClientSchema } from "@aws-amplify/backend";

// Mirrors src/lib/types.ts. Authorization:
// - MANAGER group: full access.
// - Customers: read only their own rows, matched on the Cognito `sub` stored in customerId/userId.
// - Devices never talk to AppSync; the device-ingest Lambda writes the tables directly.
const schema = a.schema({
  OrderStatus: a.enum(["PENDING", "ACCEPTED", "COMPLETED", "CANCELLED"]),
  PaymentStatus: a.enum(["UNPAID", "PENDING", "PAID", "REFUNDED"]),
  DriverStatus: a.enum(["AVAILABLE", "ON_JOB", "OFFLINE"]),

  Tenant: a
    .model({
      name: a.string().required(),
      pricePerKg: a.float().required(),
      currency: a.string().required(),
    })
    .authorization((allow) => [allow.authenticated().to(["read"]), allow.group("MANAGER")]),

  Customer: a
    .model({
      tenantId: a.id().required(),
      userId: a.string().required(), // Cognito sub
      email: a.email(),
      name: a.string(),
      telegramId: a.string(),
    })
    .secondaryIndexes((index) => [index("telegramId").name("byTelegramId"), index("userId").name("byUserId")])
    .authorization((allow) => [
      allow.ownerDefinedIn("userId").identityClaim("sub").to(["read"]),
      allow.group("MANAGER"),
    ]),

  Device: a
    .model({
      deviceId: a.string().required(), // ESP32 MAC, or legacy-<chatId> for firmware v1
      tenantId: a.id().required(),
      ownerTelegramId: a.string(),
      customerId: a.string(), // Cognito sub once linked
      address: a.string(),
      area: a.string(),
      targetKg: a.float(),
      lastWeightKg: a.float(),
      lastSeenAt: a.datetime(),
      firmwareVersion: a.string(),
      wifiRssi: a.integer(),
      apiKeyHash: a.string().authorization((allow) => [allow.group("MANAGER")]),
    })
    .identifier(["deviceId"])
    .secondaryIndexes((index) => [index("ownerTelegramId").name("byOwnerTelegramId"), index("tenantId").name("byTenant")])
    .authorization((allow) => [
      allow.ownerDefinedIn("customerId").identityClaim("sub").to(["read"]),
      allow.group("MANAGER"),
    ]),

  Driver: a
    .model({
      tenantId: a.id().required(),
      name: a.string().required(),
      telegramChatId: a.string().required(),
      status: a.ref("DriverStatus"),
    })
    .secondaryIndexes((index) => [index("telegramChatId").name("byTelegramChatId")])
    .authorization((allow) => [allow.group("MANAGER")]),

  Order: a
    .model({
      deviceOrderId: a.integer().required(),
      deviceId: a.string().required(),
      tenantId: a.id().required(),
      customerTelegramId: a.string(),
      customerId: a.string(), // Cognito sub
      driverId: a.string(),
      address: a.string(),
      weightKg: a.float().required(),
      status: a.ref("OrderStatus").required(),
      paymentStatus: a.ref("PaymentStatus").required(), // server-owned
      amountDue: a.float().required(),
      placedAt: a.datetime().required(),
      acceptedAt: a.datetime(),
      completedAt: a.datetime(),
      stripeSessionId: a.string(),
    })
    .secondaryIndexes((index) => [
      index("customerId").sortKeys(["placedAt"]).name("byCustomer"),
      index("tenantId").sortKeys(["placedAt"]).name("byTenant"),
      index("customerTelegramId").sortKeys(["placedAt"]).name("byCustomerTelegramId"),
    ])
    .authorization((allow) => [
      allow.ownerDefinedIn("customerId").identityClaim("sub").to(["read"]),
      allow.group("MANAGER"),
    ]),

  // Append-only audit log of every accepted device/bridge payload.
  OrderEvent: a
    .model({
      orderId: a.string().required(),
      deviceId: a.string().required(),
      type: a.string().required(),
      at: a.datetime().required(),
      payload: a.json(),
    })
    .secondaryIndexes((index) => [index("orderId").sortKeys(["at"]).name("byOrder")])
    .authorization((allow) => [allow.group("MANAGER").to(["read"])]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});
