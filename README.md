# Toss

**Laundry that calls its own pickup.**

**Live:** https://toss-code-x-a24a.vercel.app

Toss is a B2B2C platform for smart laundry baskets. An ESP32 + load-cell basket detects when it's full and automatically dispatches a pickup driver over Telegram. This repo is the web platform: a customer portal to track and pay, and a manager portal to run the whole city.

## Stack ($0 to run)

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS v4, hosted on **Vercel** (Hobby, free)
- **Supabase** (free): Postgres with row-level security, and Auth (Phase C)
- **Stripe** for invoices, **Anthropic Claude** for demand forecasting (later phases)

## Run locally

```bash
npm install
cp .env.example .env.local   # optional until Supabase is set up
npm run dev                  # http://localhost:3000, pick a demo role on the sign-in page
npm test                     # ingest rules + handler tests
npm run typecheck
```

## Structure

```
src/
  app/
    page.tsx              Landing page
    login/                Demo sign-in (replaced by Supabase Auth in Phase C)
    app/                  Customer portal: overview, order history, settings
    admin/                Manager portal: live board, fleet, orders, analytics
    api/ingest/           Device ingest endpoint (basket → database)
    api/cron/keepalive/   Daily ping so the free Supabase project never pauses
    api/insights/         AI insights endpoint (rule-based preview until Phase F)
  components/             UI kit, charts, portal shell, animation helpers
  lib/
    ingest/core.ts        Pure payload parsing + order merge rules
    ingest/handle.ts      Auth → parse → merge → persist pipeline (storage-agnostic)
    ingest/supabase-store.ts  Postgres implementation of the ingest store
    supabase/admin.ts     Server-only service-role client
    types.ts, data.ts, mock-data.ts, analytics.ts
  proxy.ts                Route guard (Next 16's replacement for middleware)
supabase/migrations/      Database schema, RLS policies and seed
bridge/apps-script/       Snippet that forwards Sheet webhook payloads to Toss
scripts/backfill-sheet.ts One-time import of the Google Sheet history
vercel.json               Singapore region (next to the database) + daily keep-alive cron
```

## Device ingest API

`POST /api/ingest` with header `x-device-key`.

| Caller | Key | Payload |
|---|---|---|
| Apps Script bridge / backfill | `DEVICE_BRIDGE_KEY` | Firmware v1 JSON: `{orderId, customerId, address, weight, status, paymentStatus}` |
| Firmware v2 | That basket's own key (SHA-256 stored in `devices.api_key_hash`) | `{type: "order", deviceId, orderId, status, weight, driverId?, …}` or `{type: "heartbeat", deviceId, weight, targetKg?, rssi?, …}` |

Rules enforced server-side:

- Orders are keyed `deviceId#orderId`, because every basket numbers its orders from 100.
- `paymentStatus` from devices is ignored. Payment is owned by the server (Stripe, Phase D).
- Status only moves forward, so a late or retried "ACCEPTED" can't undo "COMPLETED". Retries are idempotent.
- Weight and price are fixed when the order is placed. Timestamps are stamped by the server; only trusted callers (bridge, backfill) may supply one.
- Concurrent updates use optimistic locking on `updated_at`.
- Orders are linked to a web account automatically once that customer's Telegram ID is known.
- Firmware v1 payloads carry no device ID, so they're stored under `legacy-<telegramChatId>`.

## Deploy (free)

**1. Supabase:** database. No card needed.

1. Sign up at [supabase.com](https://supabase.com) with GitHub → **New project** → region **South Asia (Mumbai)**.
2. **SQL Editor** → paste [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) → **Run**.
3. **Project Settings → API**: copy the Project URL and the `service_role` (secret) key.

**2. Vercel:** website and API. No card needed.

1. Sign up at [vercel.com](https://vercel.com) with GitHub → **Add New → Project** → import `Toss.co`.
2. Add the environment variables from [`.env.example`](.env.example) (Supabase URL and key, a random `DEVICE_BRIDGE_KEY`, a random `CRON_SECRET`) → **Deploy**.
3. Every push to `main` redeploys automatically.

**3. Connect the existing basket (no reflash)**

1. In the Google Apps Script editor, add [`bridge/apps-script/TossBridge.gs`](bridge/apps-script/TossBridge.gs).
2. Set the Script properties `TOSS_INGEST_URL` (`https://<app>.vercel.app/api/ingest`) and `TOSS_BRIDGE_KEY`.
3. Call `forwardToToss_(data)` in `doPost`, then run `testTossBridge()`. A 400 response means authentication works.

**4. Import the Sheet history**

```bash
npx tsx scripts/backfill-sheet.ts orders.csv            # dry run
TOSS_INGEST_URL=... TOSS_BRIDGE_KEY=... npx tsx scripts/backfill-sheet.ts orders.csv --apply
```

### Free-tier notes

- Vercel Hobby is for non-commercial use. Once Toss takes real payments from real customers, move to Vercel Pro or a host that allows commercial use on its free tier.
- Free Supabase projects pause after a week without activity. The daily keep-alive cron prevents this.
- The free limits (500 MB database, 50k monthly active users, 100 GB bandwidth on Vercel) are far above what one city needs to start.

## Roadmap

| Phase | Deliverable | Status |
|---|---|---|
| A | Frontend with mock data | ✅ Done |
| B | Database, device ingest API, Google Sheet migration | ✅ Live (Supabase + Vercel); Apps Script bridge to connect |
| C | Supabase Auth + Telegram account linking, portals on live data | Next |
| D | Stripe payments | |
| E | Manager portal on live data | |
| F | Claude-powered demand forecasts | |
| G | Firmware v2 (device ID, per-device key, heartbeat) | |

## Security notes

- Never commit secrets. `.env*` is git-ignored except `.env.example`.
- The service-role key is only used server-side (`src/lib/supabase/admin.ts` imports `server-only`).
- Row-level security: customers only see their own rows; managers are identified by `app_metadata.role = 'manager'`, which only the service role can set.
- Device keys are stored only as SHA-256 hashes, and client roles can't read that column at all.
- Mock data uses placeholder Telegram IDs, not real ones.
