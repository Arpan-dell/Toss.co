import { defineBackend } from "@aws-amplify/backend";
import { FunctionUrlAuthType } from "aws-cdk-lib/aws-lambda";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { deviceIngest } from "./functions/device-ingest/resource";

const backend = defineBackend({ auth, data, deviceIngest });

// ---- Device ingest: public HTTPS endpoint, authenticated by the X-Device-Key header ----
const ingest = backend.deviceIngest;
const tables = backend.data.resources.tables;

for (const [model, env] of [
  ["Order", "ORDER_TABLE"],
  ["OrderEvent", "ORDER_EVENT_TABLE"],
  ["Device", "DEVICE_TABLE"],
  ["Customer", "CUSTOMER_TABLE"],
  ["Tenant", "TENANT_TABLE"],
] as const) {
  tables[model].grantReadWriteData(ingest.resources.lambda);
  ingest.addEnvironment(env, tables[model].tableName);
}

const ingestUrl = ingest.resources.lambda.addFunctionUrl({ authType: FunctionUrlAuthType.NONE });

backend.addOutput({
  custom: {
    deviceIngestUrl: ingestUrl.url,
  },
});
