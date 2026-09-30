import { createHash } from "node:crypto";
import type { LambdaFunctionURLEvent } from "aws-lambda";
import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for the DynamoDB document client: tables keyed by name, rows by primary key.
const tables = new Map<string, Map<string, Record<string, unknown>>>();
const table = (name: string) => tables.get(name) ?? tables.set(name, new Map()).get(name)!;
const pk = (name: string) => (name === "DeviceTable" ? "deviceId" : "id");

vi.mock("@aws-sdk/client-dynamodb", () => ({ DynamoDBClient: class {} }));
interface CmdInput {
  TableName: string;
  Key: Record<string, string>;
  Item: Record<string, unknown>;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues?: Record<string, unknown>;
}

vi.mock("@aws-sdk/lib-dynamodb", () => {
  class Cmd {
    constructor(public input: CmdInput) {}
  }
  class GetCommand extends Cmd {}
  class PutCommand extends Cmd {}
  class QueryCommand extends Cmd {}
  class UpdateCommand extends Cmd {}
  const send = async (cmd: Cmd) => {
    const { TableName, Key, Item, ExpressionAttributeValues: v = {} } = cmd.input;
    const t = table(TableName);
    if (cmd instanceof GetCommand) return { Item: t.get(Key[pk(TableName)]) };
    if (cmd instanceof PutCommand) return void t.set(Item[pk(TableName)] as string, { ...Item });
    if (cmd instanceof QueryCommand) return { Items: [...t.values()].filter((r) => r.telegramId === v[":t"]) };
    if (cmd instanceof UpdateCommand) {
      // Apply "SET #a = :a" pairs; if_not_exists keeps the existing value.
      const row = { ...(t.get(Key.deviceId) ?? { deviceId: Key.deviceId }) };
      for (const [name, attr] of Object.entries<string>(cmd.input.ExpressionAttributeNames)) {
        const key = name.slice(1);
        const value = v[`:${key}`];
        if (key === "createdAt") row[key] ??= v[":now"];
        else if (key === "tenantId") row[key] ??= v[":tenantId"];
        else if (value !== undefined) row[attr] = value;
      }
      t.set(Key.deviceId, row);
    }
  };
  return {
    DynamoDBDocumentClient: { from: () => ({ send }) },
    GetCommand,
    PutCommand,
    QueryCommand,
    UpdateCommand,
  };
});

Object.assign(process.env, {
  ORDER_TABLE: "OrderTable",
  ORDER_EVENT_TABLE: "OrderEventTable",
  DEVICE_TABLE: "DeviceTable",
  CUSTOMER_TABLE: "CustomerTable",
  TENANT_TABLE: "TenantTable",
  DEFAULT_TENANT_ID: "tenant-1",
  DEFAULT_PRICE_PER_KG: "80",
  DEVICE_BRIDGE_KEY: "bridge-secret",
});

const { handler } = await import("./handler");

async function request(body: unknown, key?: string, method = "POST") {
  const res = await handler({
    requestContext: { http: { method } },
    headers: key ? { "x-device-key": key } : {},
    body: typeof body === "string" ? body : JSON.stringify(body),
    isBase64Encoded: false,
  } as unknown as LambdaFunctionURLEvent);
  return res as { statusCode: number; body: string };
}

const legacy = { orderId: 104, customerId: "1000000001", address: "Apt 4B", weight: 5.27, status: "PENDING", paymentStatus: "UNPAID" };

beforeEach(() => tables.clear());

describe("device-ingest handler", () => {
  it("rejects missing or wrong keys and non-POST requests", async () => {
    expect((await request(legacy)).statusCode).toBe(401);
    expect((await request(legacy, "nope")).statusCode).toBe(401);
    expect((await request(legacy, "bridge-secret", "GET")).statusCode).toBe(405);
    expect((await request("{not json", "bridge-secret")).statusCode).toBe(400);
  });

  it("stores a legacy bridge order and links the known customer", async () => {
    table("CustomerTable").set("c1", { id: "c1", userId: "sub-123", telegramId: "1000000001" });
    const res = await request(legacy, "bridge-secret");
    expect(res.statusCode).toBe(200);

    const order = table("OrderTable").get("legacy-1000000001#104");
    expect(order).toMatchObject({
      __typename: "Order",
      status: "PENDING",
      paymentStatus: "UNPAID",
      amountDue: 422,
      customerId: "sub-123",
      tenantId: "tenant-1",
    });
    expect(table("OrderEventTable").size).toBe(1);
    expect(table("DeviceTable").get("legacy-1000000001")).toMatchObject({ __typename: "Device", address: "Apt 4B" });
  });

  it("never lets a later device update reset a paid invoice", async () => {
    await request(legacy, "bridge-secret");
    const row = table("OrderTable").get("legacy-1000000001#104")!;
    row.paymentStatus = "PAID";
    await request({ ...legacy, status: "COMPLETED", paymentStatus: "UNPAID" }, "bridge-secret");
    expect(table("OrderTable").get("legacy-1000000001#104")).toMatchObject({ status: "COMPLETED", paymentStatus: "PAID" });
  });

  it("authenticates a v2 device by its own key and blocks it from other devices", async () => {
    const hash = createHash("sha256").update("device-a-key").digest("hex");
    table("DeviceTable").set("dev-a", { deviceId: "dev-a", apiKeyHash: hash });

    const hb = await request({ type: "heartbeat", deviceId: "dev-a", weight: 2.4, rssi: -60 }, "device-a-key");
    expect(hb.statusCode).toBe(200);
    expect(table("DeviceTable").get("dev-a")).toMatchObject({ lastWeightKg: 2.4, wifiRssi: -60 });

    const other = await request({ type: "heartbeat", deviceId: "dev-b", weight: 1 }, "device-a-key");
    expect(other.statusCode).toBe(401);

    const legacyWithDeviceKey = await request(legacy, "device-a-key");
    expect(legacyWithDeviceKey.statusCode).toBe(401);
  });
});
