# Decisions: what we chose, why, and what we didn't

Newest areas last. Each entry: **Chose** · **Why** · **Not chosen (and why)**. Facts here match the code; where a choice is a trade-off we say so.

## Ground rules

- **$0 to run.** Only free services that need no card. This shaped most choices below (no paid routing API, no paid error tracker, no paid backups).
- **The repo is public.** No secrets in code, tests or docs; a prebuild check (`scripts/check-secrets.mjs`) fails the build if one slips in. Test data is always fake.
- **Build before push.** `npm run build` runs before every push, because a build that passes locally but fails on Vercel once broke the site silently (an RGB favicon).

## Platform

### Next.js on Vercel + Supabase
- **Chose:** Next.js (App Router, server components and actions) on Vercel; Supabase for Postgres, auth and live updates.
- **Why:** both have real free tiers; one codebase for site, dashboards and APIs; Supabase's row-level security keeps each laundry's data apart in the database itself.
- **Not chosen:** AWS Amplify + DynamoDB (the first plan): more moving parts and weak at ad-hoc queries; Google Sheets as the database: no auth, no concurrency safety, and order numbers collided across baskets; Firebase: a second vendor for no gain.

### Multi-tenant from day one
- **Chose:** every row carries a tenant; customers join a laundry by Business ID.
- **Why:** Toss is a marketplace of laundries, not one shop. Adding tenancy later means rewriting every query and policy.
- **Not chosen:** single-tenant now, "multi-tenant later".

### Row-level security as the main wall
- **Chose:** policies on every table; column-level grants for sensitive columns; the service role only on the server, after a role check.
- **Why:** a bug in a page can't leak another laundry's data if the database refuses. A reported "guessable order URL" was checked against this: the URL alone shows nothing without the right account.
- **Gotcha recorded:** new columns on `devices`/`customers`/`drivers` need an explicit select grant, or the dashboard silently loses them. Test as the `authenticated` role.
- **Not chosen:** checking ownership only in application code.

### Two hosts: site and app
- **Chose:** `tosslaundry.online` for the public site, `app.tosslaundry.online` for signed-in dashboards.
- **Why:** separates cookies and lets the app host be load-tested without Vercel blocking a burst from one IP on the main host.

## The basket and bots

### Telegram as the basket's screen
- **Chose:** removed the display; everything is done from the phone through two bots (customer: Toss Control; driver: Toss Handy). Wi-Fi setup uses a captive portal for unknown networks and remembers networks already added.
- **Why:** cheaper hardware, nothing to break, and people already have Telegram.
- **Not chosen:** an app (build and store cost, install friction); WhatsApp (business API cost).

### The customer bot stays polled by the basket; the driver bot uses a webhook
- **Why:** a Telegram bot cannot have a webhook and a poller at once, and the basket polls. The cloud therefore only *sends* through the customer bot.

### Order identity = device + order number; payment is server-owned
- **Why:** every basket counts orders from 100, so the order number alone collides. The device's own "paid" field is ignored: only the server sets payment status.

### Device keys on ingest
- **Chose:** a per-device key (or the bridge key for old firmware) on `/api/ingest`.
- **Why:** the original webhook was unauthenticated; anyone with the URL could post fake orders.

## Dispatch, weighing and routes

### Nearest online driver with room
- **Why:** simple and explainable. Drivers' limit of jobs at once is per driver (1–20).
- **Not chosen:** a global optimiser: more complexity than a small fleet needs.

### The driver's scale decides the price
- **Why:** the basket's reading is an estimate. The customer sees both numbers, so disputes are about facts. Whites and coloured can be bagged and weighed apart.

### Where clothes are weighed: a laundry setting
- **Chose:** three options in Settings → How you work: **at the door** by the driver (default), **at the store** (the driver just collects; the laundry enters each weight on the live board, then the customer gets the bill), or **the basket's reading**.
- **Safety:** a pickup without a weight is marked "to weigh"; it can't be marked ready or charged to a saved card until weighed, and the customer sees "being weighed" instead of a bill. A booking without a basket has no reading, so "no scale" and "basket's reading" fall back to weighing at the store, never a ₹0 bill.
- **Why:** some laundries have no scales for drivers, or prefer one accurate scale at the store.

### Photo proof at pickup and a 4-digit delivery code
- **Why:** protects drivers and customers in a dispute; the code makes sure clothes only go to their owner.

### Distances: straight line × 1.3
- **Chose:** the straight-line distance between points × 1.3 (a typical city road factor), counted **only between job stops**, starting where the driver was when given the job.
- **Why:** it excludes roaming, tea breaks and trips home, which was the requirement, and costs nothing.
- **Not chosen:** a paid routing API (breaks $0); counting GPS trail distance (would include detours); using the phone's total odometer (same problem).
- **Limit:** it's an estimate, good for comparing drivers and per-km pay, not exact road kilometres.

### Keeping location current
- **Chose:** ask once at the start of the shift for Telegram **live location** ("until I turn it off"); remind at most every 30 minutes when it goes stale; the route page can also send the phone's location while open.
- **Why:** a bot cannot switch a driver's live location on by itself (Telegram's rule).
- **Not chosen:** a native driver app (cost and install friction).
- Reminders run from basket pings and the daily cron, with an optional free external scheduler, so nothing paid is needed.

### Route page with numbered pins
- **Chose:** our own page (map, ordered stops, a Navigate button each, one Google Maps link). Google takes only 10 stops per link, so each stop also has its own link.
- **Why:** several orders at once need a plan the driver can see, not just a list.

## Payments

### Each laundry uses its own gateway
- **Chose:** customers pay the laundry through the laundry's own Razorpay or Stripe account; Toss never holds customer money.
- **Why:** Toss stays out of money transmission, and laundries get paid directly.
- **Not chosen:** Toss collects and pays out (needs licences, escrow and liability).

### Only the gateway can mark something paid
- **Chose:** signed webhooks (HMAC), exact amount and currency match, each event processed once (stored by event id), and Toss can ask the gateway directly if a webhook is late. The page the customer returns to proves nothing.
- **Why:** anything weaker can be faked by editing a URL or replaying a request.
- **Not chosen:** typing UPI reference numbers (slow, error-prone, hand-checked), which is gone from every flow.

### Razorpay in India, Stripe abroad
- **Why:** Razorpay has UPI, which is how India pays; Stripe is the default abroad (cards, Apple Pay, Google Pay).
- **Fact:** Stripe only opens accounts for Indian businesses by invite, so Toss's *own* dollar billing runs on Razorpay International; the Stripe code is built and waits for an invite. Laundries abroad can still connect their *own* Stripe.

### Keys are stored encrypted
- **Chose:** gateway secrets are encrypted (AES-256-GCM, key derived from a server secret) and never sent to the browser.
- **Not chosen:** plain text in the database; environment variables per laundry (can't be self-served).

### Automatic payments
- **Customers:** card saved once; each bill + chosen tip charged when the laundry marks it ready. Abroad on Stripe; in India on Razorpay with a card mandate, which needs the bank's pre-debit notice, so money arrives about a day later, and each charge is capped (₹15,000).
- **Laundries paying Toss:** monthly subscription on Toss's gateway; each charge is verified against the monthly price before the plan extends.
- **Why not unlimited or silent charging:** card-on-file rules (RBI, strong customer authentication) require consent, notice and limits; we follow them instead of working around them. A declined or over-limit charge leaves the bill open to pay by hand.

### Money formats per country
- **Chose:** a region setting (currency, weight unit, tax label, payment methods, time zone) with sensible defaults per country.
- **Why:** people abroad use different methods (PayPal, Venmo, SEPA, Pix…) and units (lb).

### Dodo Payments for Toss's own dollar billing
- **Chose:** Dodo Payments (a merchant of record) for laundries abroad paying Toss in US dollars: a "pay what you want" one-time product (Toss sets the amount for 1–12 months) and a monthly subscription product.
- **Why:** Stripe only takes Indian businesses by invite; Dodo onboards Indian sellers, handles sales tax abroad and pays out in India, and TrustMRR can verify revenue from it.
- **Checks:** Standard Webhooks signatures; amounts compared before tax (Dodo adds tax); auto-renewal refuses to start if the monthly product's price doesn't match the plan.
- **Not chosen:** Dodo for laundries' own customers (it sells software on your behalf, not local laundry services).

## Pickups without a basket

### A "virtual basket" per customer
- **Chose:** a booking creates an ordinary order on a stand-in basket row: `web-<laundry>-<customer>` (booked online), `tel-<laundry>-<phone>` (booked by the laundry), `rnd-<account>` (a hostel round). Told apart by the id, not a new column.
- **Why:** every order is keyed by its basket; reusing that keeps dispatch, weighing, payments and delivery unchanged. No new basket column means dashboards keep working before the database update runs.
- **Not chosen:** a separate "bookings" table (would duplicate the whole order pipeline).

### Booking now or for a time slot
- **Chose:** "as soon as possible" goes to the nearest driver at once; a time slot (up to 7 days ahead) goes out 30 minutes before. One open pickup per customer, a phone number required, rate-limited, cancellable until a driver takes it.
- **No weight asked:** the driver weighs at the door, as with baskets.
- **Clock:** due bookings go out on basket pings, any driver-bot message, the live board, the cron endpoints and the daily job (free). An external free scheduler every 10 minutes makes it exact.

### Hostel and PG collection rounds
- **Chose:** a business account can have a round every N days at a set time. Residents tap "I have clothes this time" until a cut-off; when it's due, every bag goes to **one driver as one stop**, with one round message and a short card per bag. The driver can add bags at the door (from a link in the round message).
- **Who pays:** the hostel (monthly account bill, at the account's price) or each resident; chosen per account.
- **Why:** this is how PG/hostel laundry works in practice (a delivery boy every two days, whoever wants to gives clothes).
- **Not chosen:** one booking per resident dispatched separately (several drivers to one building).
- **Combined trips:** hostels of the same laundry whose rounds are due together go to one driver as one trip, starting with the biggest and then the nearest next, while the bags fit (20). A bigger hostel gets its own trip. Not chosen: a full route optimiser (overkill for a handful of hostels).

## The assistant

### Rules first, AI second
- **Chose:** plain rules answer common requests instantly; Hinglish and typo fixes next; then the AI picks a tool or answers. Replies with numbers are built by our code from the database, not written by the AI.
- **Why:** exact numbers, no AI cost for common questions, and it works when the free AI quota is used up.
- **Privacy:** the AI never sees names, phones, addresses or locations. Real names are swapped for "Driver 1…" going in and swapped back coming out.
- **Actions:** only a clear typed command can change anything (for example the pickup area); an AI guess never does.
- **Not chosen:** letting the AI query the database directly (can leak or invent).

## Operations, safety and trust

### Row of "make it real" basics (the 19-point checklist)
- Already in place: login/logout, password reset (hashed single-use tokens), email verification, loading states, empty states, clear error messages with a reference, form validation, rate limiting (shared across servers), row-level security, secrets only on the server, phone layout, custom 404, privacy policy, terms, delete-my-data flow.
- Added in the latest round: onboarding checklists; error tracking; cookie-free analytics; backups.

### Onboarding checklist
- **Chose:** a card on each dashboard whose steps come from real data and which hides itself when done.
- **Not chosen:** a forced wizard (people skip them) or a tour that is dismissed and lost.

### Error tracking in our own database
- **Chose:** every logged error is also saved (redacted, one per minute per kind, 30 days) and shown on Owner → Errors; browser crashes are reported too.
- **Why:** free, no new vendor, and nothing personal leaves our database.
- **Not chosen:** Sentry and similar (a third party receiving error data; more setup and a privacy-policy change for something small).

### Cookie-free analytics
- **Chose:** Vercel Web Analytics: no cookies, no cross-site tracking, free.
- **Why:** we need to know which pages people use. The policy pages previously promised "no analytics", so they were rewritten to say exactly this.
- **Not chosen:** Google Analytics (cookies, consent banner, profiling).

### Backups
- **Chose:** `npm run backup` exports every table to a private, git-ignored folder; run weekly and before database changes.
- **Why:** Supabase's free plan has no downloadable backups.
- **Not chosen:** backing up into the repo (it's public); paid backups (breaks $0).

### Privacy and policies
- **Chose:** plain-language Terms, Privacy, Cookie, Cancellation & Refund and Shipping & Exchange pages, a delete-my-data request flow (reviewed by the owner, done within 30 days, invoices kept as tax law requires), and unsubscribe links on optional emails.
- **Why a request flow, not an instant "delete" button:** an account has invoices and money history that the law requires us to keep, so a person must decide what can go. The page says exactly what is deleted and what stays.
- The Shipping & Exchange page exists because Razorpay's review requires it.

### Tossy, the guide character
- **Chose:** give the existing assistant a face (Tossy, a little basket drawn in plain SVG in the theme's colours) and a guided tour: a spotlight on each page's real cards with Tossy explaining them, page by page. It says hello once on a new device, and "show me around" / "explain this page" (also in Hinglish) start it from the chat.
- **Why built in, not a tour library:** no extra download, it uses the site's own colours and components, and the steps point at real headings, so a renamed card only needs one line changed in `src/lib/guide/tours.ts`.
- Cards that are empty today are skipped, and nothing animates per frame (only a blink), to keep pages smooth.

### English and Hindi
- **Chose:** our own small translator instead of a library or Google Translate. The English text in the code is the key (`t("My orders")`), and `src/lib/i18n/hi.ts` holds the Hindi; anything without a Hindi line stays English, so nothing breaks while pages are translated one by one.
- **Why not Google Translate:** it would send customers' names and addresses to Google, its Hindi is stiff, and it fights with React.
- The choice is a `toss-lang` cookie on both hosts (like the theme), switched with the हिं / EN button in the header or by telling Tossy "hindi mein karo". Hindi is written the way people talk, keeping words everyone uses (पिकअप, ऑर्डर, पेमेंट).
- Done so far: menus, Tossy and its tours, sign-in, the whole customer portal, payments. Next: the manager pages, then the public website (which stays static, so it will get `/hi` pages).
- Menu names were made plainer at the same time: Today, Drivers, Stock, My plan, Home, My orders.

### One standing rule for commits
- Commit and push every change to the public repo, with no co-author or attribution line.

## Still open (not decided yet)

- Stripe for Toss's own billing, once Stripe invites us.
- Razorpay International and EMI approval (pending with Razorpay).
- Migrations `0038`, `0039` and `0040` must be run in the Supabase SQL Editor before their features show data.
