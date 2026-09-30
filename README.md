# Toss

**Laundry that calls its own pickup.**

Toss is a B2B2C platform for smart laundry baskets. An ESP32 + load-cell basket detects when it's full and automatically dispatches a pickup driver over Telegram. This repo is the web platform: a customer portal to track and pay, and a manager portal to run the whole city.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS v4
- **AWS Amplify Gen 2** (planned): Cognito auth, AppSync + DynamoDB, Lambda
- **Stripe** for invoices, **Anthropic Claude** for demand forecasting

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 and pick a demo role on the sign-in page.

## Structure

```
src/
  app/
    page.tsx            Landing page
    login/              Demo sign-in (replaced by Cognito in Phase C)
    app/                Customer portal: overview, order history, settings
    admin/              Manager portal: live board, fleet, orders, analytics
    api/insights/       AI insights endpoint (rule-based preview until Phase F)
  components/           UI kit, charts, portal shell
  lib/
    types.ts            Domain model (mirrors the DynamoDB schema)
    data.ts             Data access layer (mock now, Amplify Data later)
    mock-data.ts        Deterministic 12-week sample dataset
    analytics.ts        Aggregates shared by the charts and the AI endpoint
  proxy.ts              Route guard (Next 16's replacement for middleware)
```

## Roadmap

| Phase | Deliverable | Status |
|---|---|---|
| A | Frontend with mock data | ✅ Done |
| B | Amplify backend, device ingest API, Google Sheet migration | Next |
| C | Cognito auth + Telegram account linking | |
| D | Stripe payments | |
| E | Manager portal on live data | |
| F | Claude-powered demand forecasts | |
| G | Firmware v2 (device ID, auth, heartbeat) | |

## Security notes

- Never commit secrets. `.env*` is git-ignored. Backend secrets go in Amplify's secret store.
- Mock data uses placeholder Telegram IDs, not real ones.
