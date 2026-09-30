# Toss

**Laundry that calls its own pickup.**

Toss is a B2B2C platform for smart laundry baskets. An ESP32 + load-cell basket detects when it's full and automatically dispatches a pickup driver over Telegram. This repo is the web platform: a customer portal to track and pay, and a manager portal to run the whole city.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS v4
- **AWS Amplify Gen 2**: Cognito auth, AppSync + DynamoDB, Lambda
- **Stripe** for invoices, **Anthropic Claude** for demand forecasting

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000, pick a demo role on the sign-in page
npm test           # unit + handler tests
npm run typecheck  # web app and Amplify backend
```

## Structure

```
src/
  app/
    page.tsx            Landing page
    login/              Demo sign-in (replaced by Cognito in Phase C)
    app/                Customer portal: overview, order history, settings
    admin/              Manager portal: live board, fleet, orders, analytics
    api/insights/       AI insights endpoint (rule-based preview until Phase F)
  components/           UI kit, charts, portal shell, animation helpers
  lib/
    types.ts            Domain model (mirrors the DynamoDB schema)
    data.ts             Data access layer (mock now, Amplify Data in Phase C)
    mock-data.ts        Deterministic 12-week sample dataset
    analytics.ts        Aggregates shared by the charts and the AI endpoint
  proxy.ts              Route guard (Next 16's replacement for middleware)
amplify/
  backend.ts            Wires auth + data + functions, exposes the ingest URL
  auth/                 Cognito: email login, MANAGER / CUSTOMER groups
  data/                 Schema: Tenant, Customer, Device, Driver, Order, OrderEvent
  functions/device-ingest/
    ingest-core.ts      Pure payload parsing + order merge rules (unit-tested)
    handler.ts          Lambda Function URL handler (DynamoDB reads/writes)
bridge/apps-script/     Snippet that forwards Sheet webhook payloads to Toss
scripts/backfill-sheet.ts  One-time import of the Google Sheet history
```

## Device ingest API

`POST <deviceIngestUrl>` with header `x-device-key`.

| Caller | Key | Payload |
|---|---|---|
| Apps Script bridge / backfill | `DEVICE_BRIDGE_KEY` secret | Firmware v1 JSON: `{orderId, customerId, address, weight, status, paymentStatus}` |
| Firmware v2 | That basket's own key (SHA-256 stored on the Device row) | `{type: "order", deviceId, orderId, status, weight, driverId?, …}` or `{type: "heartbeat", deviceId, weight, targetKg?, rssi?, …}` |

Rules enforced server-side:

- Orders are keyed `deviceId#orderId`, because every basket numbers its orders from 100.
- `paymentStatus` from devices is ignored. Payment is owned by the server (Stripe, Phase D).
- Status only moves forward, so a late or retried "ACCEPTED" can't undo "COMPLETED".
- Weight and price are fixed when the order is placed. Timestamps are stamped by the server; only trusted callers (bridge, backfill) may supply one.
- Orders are linked to a web account automatically once that customer's Telegram ID is known.
- Firmware v1 payloads carry no device ID, so they're stored under `legacy-<telegramChatId>`.

## Deploying the backend (Phase B)

One-time setup:

1. Install the [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html), then run `aws configure sso` (or `aws configure` with an IAM user that has the `AmplifyBackendDeployFullAccess` policy).
2. Pick a long random bridge key and store it as a secret:
   ```bash
   npx ampx sandbox secret set DEVICE_BRIDGE_KEY
   ```
3. Deploy a personal cloud sandbox:
   ```bash
   npx ampx sandbox
   ```
   This writes `amplify_outputs.json` (git-ignored). `custom.deviceIngestUrl` is the ingest endpoint.

Connect the existing basket without reflashing:

4. In the Google Apps Script editor, add [`bridge/apps-script/TossBridge.gs`](bridge/apps-script/TossBridge.gs).
5. In Project Settings → Script properties, set `TOSS_INGEST_URL` and `TOSS_BRIDGE_KEY`.
6. Call `forwardToToss_(data)` in `doPost`, then run `testTossBridge()`. A 400 response means authentication works.

Import the history:

7. Download the Sheet as CSV and run the backfill:
   ```bash
   npx tsx scripts/backfill-sheet.ts orders.csv            # dry run
   TOSS_INGEST_URL=... TOSS_BRIDGE_KEY=... npx tsx scripts/backfill-sheet.ts orders.csv --apply
   ```

## Roadmap

| Phase | Deliverable | Status |
|---|---|---|
| A | Frontend with mock data | ✅ Done |
| B | Amplify backend, device ingest API, Google Sheet migration | ✅ Code done, awaiting AWS deploy |
| C | Cognito auth + Telegram account linking, portals on live data | Next |
| D | Stripe payments | |
| E | Manager portal on live data | |
| F | Claude-powered demand forecasts | |
| G | Firmware v2 (device ID, auth, heartbeat) | |

## Security notes

- Never commit secrets. `.env*` and `amplify_outputs.json` are git-ignored. Backend secrets go in Amplify's secret store.
- Device keys are stored only as SHA-256 hashes, and only managers can read them.
- Mock data uses placeholder Telegram IDs, not real ones.
