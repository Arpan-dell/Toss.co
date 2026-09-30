import { defineFunction, secret } from "@aws-amplify/backend";

export const deviceIngest = defineFunction({
  name: "device-ingest",
  entry: "./handler.ts",
  timeoutSeconds: 10,
  memoryMB: 256,
  // Lives in the data stack because it reads/writes the model tables directly.
  resourceGroupName: "data",
  environment: {
    // Shared key used by the Apps Script bridge and the Sheet backfill (trusted callers).
    DEVICE_BRIDGE_KEY: secret("DEVICE_BRIDGE_KEY"),
    DEFAULT_TENANT_ID: "tenant-delhi-01",
    DEFAULT_PRICE_PER_KG: "80",
  },
});
