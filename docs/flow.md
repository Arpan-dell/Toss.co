# How Toss works: the flows

A plain walk-through of what happens, in order, for each person. For *why* things are built this way, see [decisions.md](decisions.md).

## The cast

| Who | Uses | What they do |
|---|---|---|
| **Customer** | the basket, the Toss Control bot, the customer portal | Fills a basket, gets clothes picked up and returned, pays |
| **Driver** | the Toss Handy bot (Telegram), the "My route" page | Collects bags, weighs them, delivers clean clothes |
| **Manager** (laundry) | the manager dashboard | Runs the laundry: orders, drivers, payments, prices |
| **Owner** (Toss) | the owner dashboard | Runs the platform: laundries, subscriptions, errors |

## 1. A pickup, start to finish

1. **Basket fills.** The ESP32 basket weighs the clothes. At the customer's target weight it books a pickup by itself (or the customer asks for one in the bot).
2. **Order reaches Toss.** The basket posts to `/api/ingest` (through the Apps Script bridge for older firmware). The order is stored per device + order number, so two baskets never clash.
3. **Dispatch.** Toss picks the nearest *online* driver of that laundry who has room (jobs at once, up to 20). The driver's last location and the number of jobs they already carry decide it. The driver is sent the job in Toss Handy with Navigate buttons.
4. **Driver confirms** ("Got it"). If they don't, the manager can reassign; the old driver's messages about the job are taken back.
5. **Pickup.** At the door the driver weighs the bag (whites and coloured can be weighed apart) and photographs it. The driver's scale beats the basket's estimate; the price is the laundry's rate × that weight.
6. **Washing.** The laundry marks the order ready. Supplies go down automatically.
7. **Return.** Either a delivery driver brings it back (the customer gets a 4-digit code and tells it to the driver) or the customer collects from the store.
8. **Payment.** See flow 4.
9. **Invoice.** A numbered PDF invoice is emailed once the bill is paid.

## 2. A driver's day

1. Manager adds the driver by name and mobile number. The driver opens the bot, taps **Share my phone number**, and is connected.
2. Taps **Online** and turns on **live location** once ("Until I turn it off"). Their position then updates by itself.
3. If the location goes quiet while they're online, the bot reminds them (at most every 30 minutes).
4. Jobs arrive. Two or three at once? **My route** shows them all as numbered pins on a map, in order: pickups nearest-first → the store → deliveries nearest-first, with a Navigate button per stop and one Google Maps link for the whole trip.
5. The distance they drive is counted **stop to stop from where they were when given the job** (not detours). It shows on Fleet (today / yesterday / this month) and on Driver pay.
6. Taps **Offline** at the end.

## 3. Signing up and getting going

1. **Sign up** with email + password (or Google). Email verification, password reset, and sign-out all work; sign-in is rate-limited.
2. **Customer:** joins a laundry by Business ID (or finds one nearby), links Telegram, connects the basket. A "Get started" checklist on the dashboard shows what's left.
3. **Manager:** a 14-day free trial of Pro starts. The checklist walks through: store on the map, how customers pay, first driver, first basket, first pickup.
4. After the trial the laundry is on **Free** (2 drivers, core tools) or pays for **Pro**.

## 4. Money

**Customer pays the laundry** (the laundry's own gateway, never Toss's):

- India, Razorpay: Pay button → Razorpay page (UPI, card, netbanking) → Razorpay tells Toss by signed webhook → the bill is marked paid. No reference to type. A laundry can also show its own UPI ID.
- Abroad, Stripe: same, with a tip option; or **Pay automatically** (card saved once, each bill + tip charged when ready). In India the same idea works with a Razorpay card mandate, with the bank's pre-debit notice.
- Toss only believes the **gateway**: the amount and currency must match what Toss asked for, and each event counts once.

**Laundry pays Toss** (Toss's own gateway):

- Billing → Pay (1, 3, 6 or 12 months; rupees in India, dollars abroad) → gateway → webhook → plan extends.
- **Renew automatically** starts a monthly subscription; each month's charge extends the plan by one month.
- The owner sees everything on Owner → Subscription payments.

## 5. Help and safety nets

- **Assistant** (chat button): answers account questions from the database, runs a few actions (theme, pickup area, trial), and any other sensible question from the AI. Names are swapped for "Driver 1…" before anything reaches the AI.
- **Errors:** anything that fails is logged with personal details removed and kept 30 days; the owner reads them on Owner → Errors. An error screen shows a reference that matches.
- **Backups:** `npm run backup` saves every table to a private folder (see below).
- **Privacy:** Delete-my-data request → owner reviews → data deleted within 30 days (invoices kept by law).

## 6. Where things live

| Thing | Where |
|---|---|
| Website, dashboards, APIs | Next.js on Vercel (`tosslaundry.online`, `app.tosslaundry.online`) |
| Database, login, live updates | Supabase (Postgres + row-level security) |
| Bots | Telegram (customer bot polled by the basket; driver bot by webhook) |
| Payments | Razorpay / Stripe |
| Email | the mailer in `src/lib/email` |
| Daily job | Vercel Cron → `/api/cron/keepalive` (keeps Supabase awake, reminders, win-back, AI morning run, reconcile payments) |

## 7. Backing up and restoring

- **Back up:** `npm run backup` (needs `.env.local` with the Supabase service key). It writes JSON per table to `backups/<date>/`. Run it weekly and before every database change. Keep the folder private: it holds customer data.
- **Restore:** re-create the schema by running the migrations in order, then import each JSON file (Supabase Table Editor → Import, or a short script using the service key).
- Supabase's free plan has no automatic downloadable backups, which is why this exists.
