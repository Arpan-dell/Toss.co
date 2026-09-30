import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { LambdaFunctionURLEvent, LambdaFunctionURLResult } from "aws-lambda";
import { mergeOrder, parsePayload, type HeartbeatEvent, type OrderEvent, type OrderRecord } from "./ingest-core";

// Direct DynamoDB access to the Amplify model tables. Items must carry the fields
// AppSync expects on every model row: __typename, createdAt, updatedAt.

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const env = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
};

const T = {
  order: () => env("ORDER_TABLE"),
  orderEvent: () => env("ORDER_EVENT_TABLE"),
  device: () => env("DEVICE_TABLE"),
  customer: () => env("CUSTOMER_TABLE"),
  tenant: () => env("TENANT_TABLE"),
};

const json = (statusCode: number, body: unknown): LambdaFunctionURLResult => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(sha256(a));
  const bb = Buffer.from(sha256(b));
  return timingSafeEqual(ab, bb);
}

type Caller = { trusted: true } | { trusted: false; deviceId: string };

async function authenticate(key: string | undefined, deviceIdHint: string | undefined): Promise<Caller | null> {
  if (!key) return null;
  const bridgeKey = process.env.DEVICE_BRIDGE_KEY;
  if (bridgeKey && safeEqual(key, bridgeKey)) return { trusted: true };
  if (!deviceIdHint) return null;

  const { Item } = await db.send(new GetCommand({ TableName: T.device(), Key: { deviceId: deviceIdHint } }));
  if (!Item?.apiKeyHash) return null;
  return safeEqual(sha256(key), Item.apiKeyHash) ? { trusted: false, deviceId: deviceIdHint } : null;
}

async function findCustomerIdByTelegram(telegramId: string | undefined): Promise<string | undefined> {
  if (!telegramId) return undefined;
  const { Items } = await db.send(
    new QueryCommand({
      TableName: T.customer(),
      IndexName: "byTelegramId",
      KeyConditionExpression: "telegramId = :t",
      ExpressionAttributeValues: { ":t": telegramId },
      Limit: 1,
    }),
  );
  return Items?.[0]?.userId as string | undefined;
}

async function getPricePerKg(tenantId: string): Promise<number> {
  const { Item } = await db.send(new GetCommand({ TableName: T.tenant(), Key: { id: tenantId } }));
  return typeof Item?.pricePerKg === "number" ? Item.pricePerKg : Number(env("DEFAULT_PRICE_PER_KG"));
}

async function touchDevice(
  deviceId: string,
  now: string,
  fields: { weightKg?: number; targetKg?: number; rssi?: number; address?: string; ownerTelegramId?: string; fwVersion?: string },
) {
  const set: Record<string, unknown> = {
    lastSeenAt: now,
    updatedAt: now,
    lastWeightKg: fields.weightKg,
    targetKg: fields.targetKg,
    wifiRssi: fields.rssi,
    address: fields.address,
    ownerTelegramId: fields.ownerTelegramId,
    firmwareVersion: fields.fwVersion,
  };
  const entries = Object.entries(set).filter(([, v]) => v !== undefined);
  await db.send(
    new UpdateCommand({
      TableName: T.device(),
      Key: { deviceId },
      UpdateExpression:
        "SET " +
        entries.map(([k]) => `#${k} = :${k}`).join(", ") +
        ", #__typename = :__typename, #createdAt = if_not_exists(#createdAt, :now), #tenantId = if_not_exists(#tenantId, :tenantId)",
      ExpressionAttributeNames: Object.fromEntries(
        [...entries.map(([k]) => k), "__typename", "createdAt", "tenantId"].map((k) => [`#${k}`, k]),
      ),
      ExpressionAttributeValues: {
        ...Object.fromEntries(entries.map(([k, v]) => [`:${k}`, v])),
        ":__typename": "Device",
        ":now": now,
        ":tenantId": env("DEFAULT_TENANT_ID"),
      },
    }),
  );
}

async function handleOrder(ev: OrderEvent, now: string, raw: unknown) {
  const tenantId = env("DEFAULT_TENANT_ID");
  const [pricePerKg, customerId] = await Promise.all([getPricePerKg(tenantId), findCustomerIdByTelegram(ev.customerTelegramId)]);
  const id = `${ev.deviceId}#${ev.deviceOrderId}`;

  // Optimistic concurrency: retry if another request updated the order between read and write.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { Item } = await db.send(new GetCommand({ TableName: T.order(), Key: { id } }));
    const existing = Item as (OrderRecord & { updatedAt: string; createdAt: string }) | undefined;
    const { record, changed } = mergeOrder(existing, ev, { now, tenantId, pricePerKg, customerId });
    if (!changed) return { id, status: record.status, changed: false };

    try {
      await db.send(
        new PutCommand({
          TableName: T.order(),
          Item: { ...existing, ...record, __typename: "Order", createdAt: existing?.createdAt ?? now, updatedAt: now },
          ConditionExpression: existing ? "updatedAt = :prev" : "attribute_not_exists(id)",
          ExpressionAttributeValues: existing ? { ":prev": existing.updatedAt } : undefined,
        }),
      );
    } catch (err) {
      if ((err as { name?: string }).name === "ConditionalCheckFailedException") continue;
      throw err;
    }

    await db.send(
      new PutCommand({
        TableName: T.orderEvent(),
        Item: {
          id: randomUUID(),
          __typename: "OrderEvent",
          orderId: id,
          deviceId: ev.deviceId,
          type: ev.status,
          at: ev.at ?? now,
          payload: JSON.stringify(raw),
          createdAt: now,
          updatedAt: now,
        },
      }),
    );
    return { id, status: record.status, changed: true };
  }
  throw new Error("Order update conflicted repeatedly");
}

export const handler = async (event: LambdaFunctionURLEvent): Promise<LambdaFunctionURLResult> => {
  if (event.requestContext.http.method !== "POST") return json(405, { error: "Method not allowed" });

  let body: unknown;
  try {
    const text = event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString("utf8") : (event.body ?? "");
    body = JSON.parse(text);
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const deviceIdHint =
    body && typeof body === "object" && "deviceId" in body && typeof body.deviceId === "string" ? body.deviceId : undefined;
  const caller = await authenticate(event.headers["x-device-key"], deviceIdHint);
  if (!caller) return json(401, { error: "Unauthorized" });

  const parsed = parsePayload(body, { trusted: caller.trusted });
  if (!parsed.ok) return json(400, { error: parsed.error });
  const ev = parsed.value;

  // A device key only authorises that device's own data; legacy (no deviceId) payloads need the bridge key.
  if (!caller.trusted && caller.deviceId !== ev.deviceId) return json(403, { error: "Forbidden" });

  const now = new Date().toISOString();
  try {
    if (ev.kind === "heartbeat") {
      await touchDevice(ev.deviceId, now, ev satisfies HeartbeatEvent);
      return json(200, { ok: true, deviceId: ev.deviceId });
    }
    const result = await handleOrder(ev, now, body);
    await touchDevice(ev.deviceId, now, {
      address: ev.address,
      ownerTelegramId: ev.customerTelegramId,
      fwVersion: ev.fwVersion,
    });
    return json(200, { ok: true, ...result });
  } catch (err) {
    console.error("ingest failed", err);
    return json(500, { error: "Internal error" });
  }
};
