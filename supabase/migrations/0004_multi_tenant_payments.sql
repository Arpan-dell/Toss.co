-- Phase D: real multi-tenancy, join codes, UPI payments and the Toss subscription.
--
-- Roles (auth.users.app_metadata.role, settable only by the service role):
--   owner    — the Toss platform owner: sees every business, approves subscription payments
--   manager  — runs one laundry business: app_metadata.tenant_id says which
--   (none)   — customer: belongs to a business via customers.tenant_id, chosen by entering its Business ID

-- ---------- helpers ----------
create or replace function public.auth_role()
returns text language sql stable set search_path = ''
as $$ select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'customer') $$;

create or replace function public.auth_tenant()
returns text language sql stable set search_path = ''
as $$ select auth.jwt() -> 'app_metadata' ->> 'tenant_id' $$;

create or replace function public.is_owner()
returns boolean language sql stable set search_path = ''
as $$ select public.auth_role() = 'owner' $$;

create or replace function public.is_manager()
returns boolean language sql stable set search_path = ''
as $$ select public.auth_role() = 'manager' $$;

-- Short, unambiguous IDs people can read out loud: e.g. B-7K2Q9M, C-4XN8PD.
create or replace function public.gen_code(prefix text)
returns text language plpgsql volatile set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := prefix || '-';
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

-- ---------- platform settings (single row) ----------
create table public.platform_settings (
  id int primary key default 1 check (id = 1),
  monthly_price double precision not null default 499 check (monthly_price >= 0),
  trial_days int not null default 14 check (trial_days >= 0),
  owner_upi_id text,
  owner_upi_name text not null default 'Toss',
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (1) on conflict do nothing;
create trigger platform_settings_updated before update on public.platform_settings
  for each row execute function public.set_updated_at();

-- ---------- tenants become real businesses ----------
alter table public.tenants
  add column join_code text unique,
  add column manager_id uuid references auth.users (id) on delete set null,
  add column upi_id text,
  add column upi_name text,
  add column plan_status text not null default 'TRIAL' check (plan_status in ('TRIAL', 'ACTIVE', 'SUSPENDED')),
  add column trial_ends_at timestamptz,
  add column paid_until timestamptz;
update public.tenants set join_code = public.gen_code('B') where join_code is null;
alter table public.tenants alter column join_code set not null, alter column join_code set default public.gen_code('B');
create index tenants_manager_idx on public.tenants (manager_id);

-- ---------- customers: own ID, business chosen by join code ----------
alter table public.customers
  add column customer_code text unique,
  alter column tenant_id drop not null;
update public.customers set customer_code = public.gen_code('C') where customer_code is null;
alter table public.customers alter column customer_code set not null, alter column customer_code set default public.gen_code('C');

-- Baskets and orders can exist before their owner has joined a business.
alter table public.devices alter column tenant_id drop not null;
alter table public.orders alter column tenant_id drop not null;

-- ---------- UPI payment tracking on orders ----------
alter table public.orders
  add column payment_method text check (payment_method in ('UPI', 'CASH', 'OTHER')),
  add column payment_ref text,               -- UPI transaction reference (UTR) the customer submitted
  add column payment_reported_at timestamptz,
  add column payment_confirmed_at timestamptz;

-- ---------- subscription payments (manager → Toss) ----------
create table public.subscription_payments (
  id bigint generated always as identity primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  months int not null check (months between 1 and 12),
  amount double precision not null check (amount >= 0),
  payment_ref text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index subscription_payments_tenant_idx on public.subscription_payments (tenant_id, created_at desc);
create index subscription_payments_pending_idx on public.subscription_payments (created_at) where status = 'PENDING';

-- New signups are customers with no business yet.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.customers (id, email, name)
  values (new.id, new.email, nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------- row level security ----------
drop policy if exists "tenants: signed-in users read" on public.tenants;
drop policy if exists "tenants: managers insert" on public.tenants;
drop policy if exists "tenants: managers update" on public.tenants;
drop policy if exists "tenants: managers delete" on public.tenants;
drop policy if exists "customers: read own or manager" on public.customers;
drop policy if exists "customers: managers insert" on public.customers;
drop policy if exists "customers: managers update" on public.customers;
drop policy if exists "customers: managers delete" on public.customers;
drop policy if exists "devices: read own or manager" on public.devices;
drop policy if exists "devices: managers insert" on public.devices;
drop policy if exists "devices: managers update" on public.devices;
drop policy if exists "devices: managers delete" on public.devices;
drop policy if exists "drivers: managers only" on public.drivers;
drop policy if exists "orders: read own or manager" on public.orders;
drop policy if exists "orders: managers insert" on public.orders;
drop policy if exists "orders: managers update" on public.orders;
drop policy if exists "orders: managers delete" on public.orders;
drop policy if exists "order_events: managers read" on public.order_events;

alter table public.platform_settings enable row level security;
alter table public.subscription_payments enable row level security;

-- Customers can see the business they joined (name, UPI ID, price) to pay it.
create policy "tenants: read" on public.tenants for select to authenticated using (
  (select public.is_owner())
  or id = (select public.auth_tenant())
  or id = (select c.tenant_id from public.customers c where c.id = (select auth.uid()))
);
create policy "tenants: manager updates own" on public.tenants for update to authenticated
  using (id = (select public.auth_tenant())) with check (id = (select public.auth_tenant()));
-- Managers may change only their profile, never plan status or dates (owner-only, via server).
revoke update on public.tenants from authenticated;
grant update (name, price_per_kg, upi_id, upi_name) on public.tenants to authenticated;

create policy "customers: read" on public.customers for select to authenticated using (
  id = (select auth.uid())
  or (select public.is_owner())
  or (tenant_id is not null and tenant_id = (select public.auth_tenant()))
);

create policy "devices: read" on public.devices for select to authenticated using (
  customer_id = (select auth.uid())
  or (select public.is_owner())
  or (tenant_id is not null and tenant_id = (select public.auth_tenant()))
);
create policy "devices: manager updates own business" on public.devices for update to authenticated
  using (tenant_id = (select public.auth_tenant())) with check (tenant_id = (select public.auth_tenant()));

create policy "drivers: manager's business" on public.drivers for all to authenticated
  using (tenant_id = (select public.auth_tenant())) with check (tenant_id = (select public.auth_tenant()));
create policy "drivers: owner reads" on public.drivers for select to authenticated using ((select public.is_owner()));

create policy "orders: read" on public.orders for select to authenticated using (
  customer_id = (select auth.uid())
  or (select public.is_owner())
  or (tenant_id is not null and tenant_id = (select public.auth_tenant()))
);
create policy "orders: manager updates own business" on public.orders for update to authenticated
  using (tenant_id = (select public.auth_tenant())) with check (tenant_id = (select public.auth_tenant()));
-- Managers adjust payment and amount only; order identity and device data stay device-owned.
revoke update on public.orders from authenticated;
grant update (amount_due, payment_status, payment_method, payment_ref, payment_confirmed_at) on public.orders to authenticated;

create policy "order_events: read" on public.order_events for select to authenticated using (
  (select public.is_owner())
  or exists (select 1 from public.orders o where o.id = order_id and o.tenant_id = (select public.auth_tenant()))
);

create policy "platform_settings: read" on public.platform_settings for select to authenticated using (true);

create policy "subscription_payments: read" on public.subscription_payments for select to authenticated using (
  (select public.is_owner()) or tenant_id = (select public.auth_tenant())
);

-- ---------- actions (security definer; each checks who is calling) ----------

-- Customer enters a Business ID. Unassigned baskets and orders follow them into the business.
create or replace function public.join_tenant(p_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  t record;
  uid uuid := auth.uid();
  tg text;
begin
  if uid is null or public.auth_role() <> 'customer' then
    raise exception 'only_customers_can_join' using errcode = 'P0001';
  end if;
  select id, name, plan_status into t from public.tenants where join_code = upper(trim(p_code));
  if t.id is null then raise exception 'unknown_business_id' using errcode = 'P0002'; end if;
  if t.plan_status = 'SUSPENDED' then raise exception 'business_suspended' using errcode = 'P0001'; end if;

  update public.customers set tenant_id = t.id where id = uid returning telegram_id into tg;
  update public.devices set tenant_id = t.id where tenant_id is null and (customer_id = uid or (tg is not null and owner_telegram_id = tg));
  update public.orders set tenant_id = t.id where tenant_id is null and (customer_id = uid or (tg is not null and customer_telegram_id = tg));
  return jsonb_build_object('tenant_id', t.id, 'name', t.name);
end;
$$;

-- Customer reports a UPI payment for their own unpaid order; the manager then confirms or rejects.
create or replace function public.report_payment(p_order text, p_ref text)
returns void language plpgsql security definer set search_path = ''
as $$
declare ref text := upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'));
begin
  if ref !~ '^[A-Z0-9]{6,35}$' then raise exception 'invalid_reference' using errcode = 'P0001'; end if;
  update public.orders
     set payment_status = 'PENDING', payment_method = 'UPI', payment_ref = ref, payment_reported_at = now()
   where id = p_order and customer_id = auth.uid() and payment_status = 'UNPAID' and status <> 'CANCELLED';
  if not found then raise exception 'order_not_payable' using errcode = 'P0002'; end if;
end;
$$;

-- Manager submits a subscription payment they made to the owner's UPI ID.
create or replace function public.submit_subscription_payment(p_months int, p_ref text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  ref text := upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'));
  price double precision;
begin
  if public.auth_role() <> 'manager' or public.auth_tenant() is null then
    raise exception 'only_managers' using errcode = 'P0001';
  end if;
  if ref !~ '^[A-Z0-9]{6,35}$' then raise exception 'invalid_reference' using errcode = 'P0001'; end if;
  if p_months not between 1 and 12 then raise exception 'invalid_months' using errcode = 'P0001'; end if;
  select monthly_price into price from public.platform_settings where id = 1;
  insert into public.subscription_payments (tenant_id, months, amount, payment_ref)
  values (public.auth_tenant(), p_months, price * p_months, ref);
end;
$$;

-- Server-only (service role): turn a customer account into the manager of a new business.
create or replace function public.register_business(p_user uuid, p_name text, p_upi_id text, p_upi_name text, p_price double precision)
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
  insert into public.tenants (id, name, price_per_kg, currency, manager_id, upi_id, upi_name, plan_status, trial_ends_at)
  values (new_id, p_name, p_price, 'INR', p_user, p_upi_id, p_upi_name, 'TRIAL', now() + make_interval(days => trial))
  returning join_code into code;
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'manager', 'tenant_id', new_id)
   where id = p_user;
  return jsonb_build_object('tenant_id', new_id, 'join_code', code);
end;
$$;

-- Server-only (service role): owner approves or rejects a subscription payment.
create or replace function public.review_subscription_payment(p_id bigint, p_approve boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare p record;
begin
  select * into p from public.subscription_payments where id = p_id and status = 'PENDING' for update;
  if p.id is null then raise exception 'payment_not_pending' using errcode = 'P0002'; end if;
  update public.subscription_payments set status = case when p_approve then 'APPROVED' else 'REJECTED' end, reviewed_at = now()
   where id = p_id;
  if p_approve then
    -- Extend from whichever is later: now, the current paid-up date, or the end of the trial.
    update public.tenants
       set paid_until = greatest(now(), coalesce(paid_until, now()), coalesce(trial_ends_at, now())) + make_interval(months => p.months),
           plan_status = case when plan_status = 'SUSPENDED' then plan_status else 'ACTIVE' end
     where id = p.tenant_id;
  end if;
end;
$$;

-- Linking Telegram also pulls the customer's existing baskets and orders into their business.
create or replace function public.link_telegram(p_customer uuid, p_telegram_id text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  owner uuid;
  t text;
  linked_orders int;
  linked_devices int;
begin
  select id into owner from public.customers where telegram_id = p_telegram_id;
  if owner is not null and owner <> p_customer then
    raise exception 'telegram_already_linked' using errcode = 'P0001';
  end if;

  update public.customers set telegram_id = p_telegram_id where id = p_customer returning tenant_id into t;
  if not found then raise exception 'customer_not_found' using errcode = 'P0002'; end if;

  update public.orders set customer_id = p_customer, tenant_id = coalesce(tenant_id, t)
    where customer_telegram_id = p_telegram_id and customer_id is null;
  get diagnostics linked_orders = row_count;

  update public.devices set customer_id = p_customer, tenant_id = coalesce(tenant_id, t)
    where owner_telegram_id = p_telegram_id and customer_id is null;
  get diagnostics linked_devices = row_count;

  return jsonb_build_object('orders', linked_orders, 'devices', linked_devices);
end;
$$;

revoke execute on function public.register_business(uuid, text, text, text, double precision) from public, anon, authenticated;
revoke execute on function public.review_subscription_payment(bigint, boolean) from public, anon, authenticated;
revoke execute on function public.link_telegram(uuid, text) from public, anon, authenticated;
grant execute on function public.register_business(uuid, text, text, text, double precision) to service_role;
grant execute on function public.review_subscription_payment(bigint, boolean) to service_role;
grant execute on function public.link_telegram(uuid, text) to service_role;
revoke execute on function public.join_tenant(text) from public, anon;
revoke execute on function public.report_payment(text, text) from public, anon;
revoke execute on function public.submit_subscription_payment(int, text) from public, anon;
grant execute on function public.join_tenant(text) to authenticated;
grant execute on function public.report_payment(text, text) to authenticated;
grant execute on function public.submit_subscription_payment(int, text) to authenticated;
