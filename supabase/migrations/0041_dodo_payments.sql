-- 0041: Dodo Payments for Toss's own US-dollar billing (run after 0040).
-- Dodo is a merchant of record: it sells Toss plans to laundries abroad, handles their sales tax and pays Toss out
-- to an Indian bank account. It's only for Toss's own billing (platform_gateways), never for a laundry's customers.
-- Dodo charges for products made in its dashboard, so the connection also keeps two product ids (not secret).

alter table public.platform_gateways drop constraint if exists platform_gateways_provider_check;
alter table public.platform_gateways add constraint platform_gateways_provider_check check (provider in ('razorpay', 'stripe', 'dodo'));
alter table public.platform_gateways add column if not exists config jsonb not null default '{}'::jsonb; -- {"once": "pdt_…", "monthly": "pdt_…"}

alter table public.payment_intents drop constraint if exists payment_intents_provider_check;
alter table public.payment_intents add constraint payment_intents_provider_check check (provider in ('razorpay', 'stripe', 'dodo'));

alter table public.plan_autorenew drop constraint if exists plan_autorenew_provider_check;
alter table public.plan_autorenew add constraint plan_autorenew_provider_check check (provider in ('razorpay', 'stripe', 'dodo'));
