-- 0036: payments confirmed by the payment gateway itself (run after 0035).
-- A laundry connects its own Razorpay (India) or Stripe (elsewhere) account; customers pay on the gateway's page and
-- the gateway tells Toss, server to server, with a signed message (a webhook). Only that signed message, or Toss
-- asking the gateway directly, can mark a bill paid: nothing the customer's browser sends (a URL, a typed ID)
-- counts. Money goes straight to the laundry's account; Toss never holds it.
--
-- Everything here is server-only: no policies are granted to signed-in users, and the gateway keys are stored
-- encrypted by the app (AES-256-GCM), so even a database read doesn't reveal them.

-- ---------- a laundry's gateway connection ----------
create table if not exists public.tenant_gateways (
  tenant_id text primary key references public.tenants(id) on delete cascade,
  provider text not null check (provider in ('razorpay', 'stripe')),
  key_id text,                       -- Razorpay key ID (public); empty for Stripe
  secret_enc text not null,          -- Razorpay key secret / Stripe secret key, encrypted
  webhook_secret_enc text,           -- the webhook signing secret, encrypted
  webhook_token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'), -- in the webhook URL
  webhook_endpoint_id text,          -- Stripe's id for the endpoint Toss created (to replace it later)
  live boolean not null default false, -- live keys (real money) or test keys
  connected_at timestamptz not null default now(),
  last_event_at timestamptz
);
alter table public.tenant_gateways enable row level security;
revoke all on public.tenant_gateways from anon, authenticated;

-- what customers and the laundry may know: which gateway (never the keys)
alter table public.tenants add column if not exists online_gateway text check (online_gateway in ('razorpay', 'stripe'));

-- ---------- Toss's own gateway, for subscriptions (connected from Owner → Plan & payments) ----------
-- One for rupee subscriptions (Indian businesses) and one for US dollar ones (everyone else).
create table if not exists public.platform_gateways (
  currency_group text primary key check (currency_group in ('INR', 'USD')),
  provider text not null check (provider in ('razorpay', 'stripe')),
  key_id text,
  secret_enc text not null,
  webhook_secret_enc text,
  webhook_endpoint_id text,
  live boolean not null default false,
  connected_at timestamptz not null default now(),
  last_event_at timestamptz
);
alter table public.platform_gateways enable row level security;
revoke all on public.platform_gateways from anon, authenticated;

-- ---------- one row per payment attempt ----------
create table if not exists public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('order', 'subscription')),
  tenant_id text not null references public.tenants(id) on delete cascade,
  order_id text references public.orders(id) on delete cascade,  -- kind = order
  customer_id uuid,                                               -- who started it (kind = order)
  months int check (months between 1 and 12),                     -- kind = subscription
  discount_pct int not null default 0,
  credit_used double precision not null default 0,
  provider text not null check (provider in ('razorpay', 'stripe')),
  platform boolean not null default false,       -- paid to Toss (subscription) rather than to the laundry
  provider_ref text unique,                       -- Razorpay payment link id / Stripe checkout session id
  checkout_url text,                              -- the gateway's payment page (reused while it's open)
  amount_minor bigint not null check (amount_minor > 0), -- what the gateway must report, in paise/cents
  currency text not null,
  tip double precision not null default 0,
  status text not null default 'created' check (status in ('created', 'paid', 'failed', 'expired', 'mismatch')),
  provider_payment_id text unique,               -- the gateway's payment id once paid
  method text,                                   -- upi, card, netbanking… as the gateway reports it
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists payment_intents_order_idx on public.payment_intents (order_id) where order_id is not null;
create index if not exists payment_intents_open_idx on public.payment_intents (status, created_at) where status = 'created';
alter table public.payment_intents enable row level security;
revoke all on public.payment_intents from anon, authenticated;

-- ---------- every signed webhook, once ----------
create table if not exists public.payment_events (
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  type text,
  intent_id uuid,
  primary key (provider, event_id)
);
alter table public.payment_events enable row level security;
revoke all on public.payment_events from anon, authenticated;

-- ---------- orders paid through a gateway ----------
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check (payment_method = any (array[
  'UPI', 'CASH', 'OTHER', 'PAYPAL', 'VENMO', 'CASHAPP', 'ZELLE', 'INTERAC', 'SEPA', 'BANK', 'PIX', 'PAYNOW', 'MPESA', 'GCASH', 'LINK', 'CARD',
  'RAZORPAY', 'STRIPE'
]));
