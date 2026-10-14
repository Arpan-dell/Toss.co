-- 0035: Toss outside India.
-- A business now has a country, and from it a currency, time zone, weight unit (kg or lb), tax label/rate and the
-- payment methods its customers use (UPI in India; PayPal, Venmo, SEPA bank transfer, Pix and others elsewhere).
-- Businesses outside India pay the Toss subscription in US dollars. Customers can save laundry preferences, add a
-- tip when they pay, and a business can set a minimum order.

-- ---------- businesses ----------
alter table public.tenants
  add column if not exists country text not null default 'IN',
  add column if not exists timezone text not null default 'Asia/Kolkata',
  add column if not exists weight_unit text not null default 'kg',
  add column if not exists pay_methods jsonb not null default '{}'::jsonb,
  add column if not exists tax_label text,
  add column if not exists tax_pct double precision not null default 0,
  add column if not exists tax_id text,
  add column if not exists min_order double precision not null default 0;

alter table public.tenants
  add constraint tenants_country_check check (country ~ '^[A-Z]{2}$'),
  add constraint tenants_currency_check check (currency ~ '^[A-Z]{3}$'),
  add constraint tenants_timezone_check check (char_length(timezone) between 3 and 64),
  add constraint tenants_weight_unit_check check (weight_unit in ('kg', 'lb')),
  add constraint tenants_pay_methods_check check (jsonb_typeof(pay_methods) = 'object' and pg_column_size(pay_methods) < 4000),
  add constraint tenants_tax_label_check check (tax_label is null or char_length(tax_label) <= 30),
  add constraint tenants_tax_pct_check check (tax_pct >= 0 and tax_pct <= 50),
  add constraint tenants_tax_id_check check (tax_id is null or char_length(tax_id) <= 40),
  add constraint tenants_min_order_check check (min_order >= 0 and min_order <= 100000);

-- managers edit these from their settings (the app checks the password for money-related ones, as for UPI)
grant update (country, currency, timezone, weight_unit, pay_methods, tax_label, tax_pct, tax_id, min_order) on public.tenants to authenticated;

-- Whole units for currencies without cents in daily use (rupees, yen…), cents for the rest.
create or replace function public.money_round(x double precision, cur text)
returns double precision language sql immutable set search_path = ''
as $$
  select case when cur in ('INR', 'JPY', 'KRW', 'IDR', 'VND', 'CLP', 'HUF', 'PKR', 'LKR', 'NPR', 'BDT', 'NGN', 'KES', 'UGX', 'TZS')
              then round(x::numeric)::double precision
              else round(x::numeric, 2)::double precision end
$$;

-- ---------- orders: more ways to pay, and tips ----------
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check (payment_method = any (array[
  'UPI', 'CASH', 'OTHER', 'PAYPAL', 'VENMO', 'CASHAPP', 'ZELLE', 'INTERAC', 'SEPA', 'BANK', 'PIX', 'PAYNOW', 'MPESA', 'GCASH', 'LINK', 'CARD'
]));
alter table public.orders add column if not exists tip double precision not null default 0;
alter table public.orders add constraint orders_tip_check check (tip >= 0 and tip <= 100000);
grant select (tip) on public.orders to authenticated;

-- The customer says they've paid: which method, its reference, and an optional tip for the driver.
-- UPI keeps its strict reference (UTR); other methods' IDs vary (PayPal 17 characters, bank references…).
drop function if exists public.report_payment(text, text);
create or replace function public.report_payment(p_order text, p_ref text, p_method text default 'UPI', p_tip double precision default 0)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  ref text := upper(regexp_replace(coalesce(p_ref, ''), '[^A-Za-z0-9]', '', 'g'));
  m text := upper(coalesce(p_method, 'UPI'));
begin
  if m not in ('UPI', 'PAYPAL', 'VENMO', 'CASHAPP', 'ZELLE', 'INTERAC', 'SEPA', 'BANK', 'PIX', 'PAYNOW', 'MPESA', 'GCASH', 'LINK', 'CARD', 'OTHER') then
    raise exception 'invalid_method' using errcode = 'P0001';
  end if;
  if (m = 'UPI' and ref !~ '^[A-Z0-9]{6,35}$') or (m <> 'UPI' and ref !~ '^[A-Z0-9]{4,35}$') then
    raise exception 'invalid_reference' using errcode = 'P0001';
  end if;
  if p_tip is null or p_tip < 0 or p_tip > 100000 then raise exception 'invalid_tip' using errcode = 'P0001'; end if;
  update public.orders
     set payment_status = 'PENDING', payment_method = m, payment_ref = ref, payment_reported_at = now(), tip = p_tip
   where id = p_order and customer_id = auth.uid() and payment_status = 'UNPAID' and status <> 'CANCELLED';
  if not found then raise exception 'order_not_payable' using errcode = 'P0002'; end if;
end;
$$;
revoke execute on function public.report_payment(text, text, text, double precision) from public, anon;
grant execute on function public.report_payment(text, text, text, double precision) to authenticated;

-- ---------- customers: laundry preferences ----------
alter table public.customers add column if not exists prefs jsonb not null default '{}'::jsonb;
alter table public.customers add constraint customers_prefs_check check (jsonb_typeof(prefs) = 'object' and pg_column_size(prefs) < 2000);
grant select (prefs), update (prefs) on public.customers to authenticated;

-- ---------- registering a business, with its region ----------
drop function if exists public.register_business(uuid, text, text, text, double precision);
create or replace function public.register_business(
  p_user uuid, p_name text, p_upi_id text, p_upi_name text, p_price double precision,
  p_country text default 'IN', p_currency text default 'INR', p_timezone text default 'Asia/Kolkata', p_weight_unit text default 'kg'
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  new_id text := 'tenant-' || replace(gen_random_uuid()::text, '-', '');
  trial int;
  code text;
begin
  if exists (select 1 from public.tenants where manager_id = p_user) then
    raise exception 'already_manages_a_business' using errcode = 'P0001';
  end if;
  select trial_days into trial from public.platform_settings where id = 1;
  insert into public.tenants (id, name, price_per_kg, currency, manager_id, upi_id, upi_name, plan_status, trial_ends_at, country, timezone, weight_unit)
  values (new_id, p_name, p_price, upper(p_currency), p_user, nullif(p_upi_id, ''), nullif(p_upi_name, ''), 'TRIAL', now() + make_interval(days => trial),
          upper(p_country), p_timezone, p_weight_unit)
  returning join_code into code;
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'manager', 'tenant_id', new_id)
   where id = p_user;
  return jsonb_build_object('tenant_id', new_id, 'join_code', code);
end;
$$;
revoke execute on function public.register_business(uuid, text, text, text, double precision, text, text, text, text) from public, anon, authenticated;
grant execute on function public.register_business(uuid, text, text, text, double precision, text, text, text, text) to service_role;

-- ---------- the Toss subscription in US dollars outside India ----------
alter table public.platform_settings
  add column if not exists usd_monthly_price double precision not null default 19,
  add column if not exists usd_branch_price double precision not null default 9,
  add column if not exists owner_paypal text,
  add column if not exists owner_intl_link text;
alter table public.platform_settings
  add constraint platform_settings_usd_prices_check check (usd_monthly_price >= 0 and usd_branch_price >= 0),
  add constraint platform_settings_owner_intl_link_check check (owner_intl_link is null or owner_intl_link ~ '^https://');

alter table public.subscription_payments add column if not exists currency text not null default 'INR';

-- Same as before for Indian businesses (rupees, UPI reference, basket credit can pay part of it). Everyone else
-- pays the US dollar price, with a PayPal or other transaction ID, and no basket credit (it's in rupees).
create or replace function public.submit_subscription_payment(p_months integer, p_ref text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  ref text := upper(regexp_replace(coalesce(p_ref, ''), '[^A-Za-z0-9]', '', 'g'));
  price double precision;
  pct int;
  maxpct int;
  base double precision;
  credit double precision := 0;
  cur text;
begin
  if public.auth_role() <> 'manager' or public.auth_tenant() is null then
    raise exception 'only_managers' using errcode = 'P0001';
  end if;
  if ref !~ '^[A-Z0-9]{6,35}$' then raise exception 'invalid_reference' using errcode = 'P0001'; end if;
  if p_months not between 1 and 12 then raise exception 'invalid_months' using errcode = 'P0001'; end if;
  select case when t.currency = 'INR' then 'INR' else 'USD' end,
         case when t.currency = 'INR' then (case when t.parent_tenant_id is null then s.monthly_price else s.branch_price end)
              else (case when t.parent_tenant_id is null then s.usd_monthly_price else s.usd_branch_price end) end,
         s.credit_sub_max_pct
    into cur, price, maxpct
    from public.platform_settings s, public.tenants t
   where s.id = 1 and t.id = public.auth_tenant();
  pct := public.subscription_discount(p_months);
  base := public.money_round(price * p_months * (100 - pct) / 100, cur);
  if cur = 'INR' then
    -- coalesce: least() skips nulls, so an unreadable balance must count as zero, not as "no limit"
    credit := least(floor(coalesce(public.tenant_credit_balance(public.auth_tenant()), 0)), floor(base * maxpct / 100.0));
  end if;
  insert into public.subscription_payments (tenant_id, months, amount, discount_pct, credit_used, payment_ref, currency)
  values (public.auth_tenant(), p_months, base - credit, pct, credit, ref, cur);
end;
$$;
