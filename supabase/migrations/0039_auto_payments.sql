-- 0039: automatic payments (run after 0038).
--  - Laundries can renew their Toss plan automatically every month: a subscription on Toss's own gateway
--    (Razorpay Subscriptions: card or UPI Autopay; Stripe subscriptions for US dollars).
--  - Customers of laundries on Razorpay (India) can save a card too, like Stripe laundries abroad: each bill (and
--    tip) is charged automatically, after the bank's pre-debit notice. Razorpay calls the saved card a token.

create table if not exists public.plan_autorenew (
  tenant_id text primary key references public.tenants(id) on delete cascade,
  provider text not null check (provider in ('razorpay', 'stripe')),
  currency text not null,
  amount_minor integer not null check (amount_minor > 0),  -- what each month costs, in paise / cents
  provider_ref text,                                        -- the page the manager opened (Razorpay subscription / Stripe checkout session)
  provider_sub_id text unique,                              -- the subscription on the gateway
  checkout_url text,
  status text not null default 'created' check (status in ('created', 'active', 'failing', 'cancelled')),
  last_charged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- server-only: read and written with the service role after the manager check
alter table public.plan_autorenew enable row level security;
revoke all on public.plan_autorenew from anon, authenticated;

alter table public.customer_payment_profiles drop constraint if exists customer_payment_profiles_provider_check;
alter table public.customer_payment_profiles add constraint customer_payment_profiles_provider_check check (provider in ('stripe', 'razorpay'));
