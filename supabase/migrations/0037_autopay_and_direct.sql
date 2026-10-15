-- 0037: two payment choices for laundries (run after 0036).
--  1. A laundry with its own gateway can ALSO keep showing its UPI ID (or other details) for customers who prefer
--     paying directly; it confirms those with one tap.
--  2. Pay automatically (Stripe, mainly for laundries abroad): a customer saves a card / Apple Pay / Google Pay
--     once, and each bill is charged when the laundry marks it ready, with the tip they chose. That's how laundry
--     pickup apps work in the US and Europe.

alter table public.tenants add column if not exists also_direct boolean not null default false;

-- a customer's saved card at one laundry's Stripe account (server-only; no card numbers, just Stripe's ids)
create table if not exists public.customer_payment_profiles (
  tenant_id text not null references public.tenants(id) on delete cascade,
  customer_id uuid not null,
  provider text not null default 'stripe' check (provider = 'stripe'),
  provider_customer_id text not null,     -- Stripe customer on the laundry's account
  payment_method_id text,                 -- set once the card is saved
  brand text,
  last4 text,
  exp text,
  tip_pct int not null default 0 check (tip_pct between 0 and 30),
  autopay boolean not null default false,
  setup_ref text,                         -- the Stripe setup page in progress
  updated_at timestamptz not null default now(),
  primary key (tenant_id, customer_id)
);
alter table public.customer_payment_profiles enable row level security;
revoke all on public.customer_payment_profiles from anon, authenticated;

-- charges made automatically from a saved card
alter table public.payment_intents add column if not exists auto boolean not null default false;
