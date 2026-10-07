-- Business accounts and branches.
--
-- 1. Business accounts: a PG, hostel or office with several baskets, its own price per kg and one bill a month
--    instead of a UPI payment per pickup. A basket assigned to an account puts its new pickups on that account.
-- 2. Branches: one manager can run several laundries. Each branch is its own business (own Business ID, drivers,
--    baskets and plan) linked to the first one; an extra branch's Pro plan costs platform_settings.branch_price.

-- ---------- 1. business accounts ----------
create table public.business_accounts (
  id text primary key default public.gen_code('A'),
  tenant_id text not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  contact_name text check (contact_name is null or char_length(contact_name) <= 80),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (email is null or (char_length(email) <= 200 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  price_per_kg double precision check (price_per_kg is null or (price_per_kg > 0 and price_per_kg <= 10000)),
  created_at timestamptz not null default now()
);
create index business_accounts_tenant_idx on public.business_accounts (tenant_id);

alter table public.business_accounts enable row level security;
create policy "business_accounts: read" on public.business_accounts for select to authenticated using (
  tenant_id = (select public.auth_tenant()) or (select public.is_owner())
);
create policy "business_accounts: manager writes" on public.business_accounts for all to authenticated
  using (tenant_id = (select public.auth_tenant()) and (select public.auth_role()) = 'manager')
  with check (tenant_id = (select public.auth_tenant()) and (select public.auth_role()) = 'manager');

alter table public.devices add column account_id text references public.business_accounts (id) on delete set null;
grant update (account_id) on public.devices to authenticated;

alter table public.orders add column account_id text references public.business_accounts (id) on delete set null;
create index orders_account_idx on public.orders (account_id, completed_at) where account_id is not null;

-- New pickups from an account's basket go on the account, priced at the account's rate (while unpaid).
-- Named to run before orders_apply_credit (triggers fire in name order), so basket credit sees the account price.
create or replace function public.orders_account_price()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  acct_tenant text;
  acct_price double precision;
  base double precision;
begin
  if tg_op = 'INSERT' and new.account_id is null then
    select d.account_id into new.account_id from public.devices d where d.device_id = new.device_id;
  end if;
  if new.account_id is not null and (tg_op = 'INSERT' or old.account_id is distinct from new.account_id) then
    select tenant_id, price_per_kg into acct_tenant, acct_price from public.business_accounts where id = new.account_id;
    -- an account only bills pickups of its own laundry
    if acct_tenant is distinct from new.tenant_id then
      new.account_id := null;
      return new;
    end if;
    if acct_price is not null and new.payment_status = 'UNPAID' then
      base := round((coalesce(new.weight_kg, 0) * acct_price)::numeric);
      if new.discount_pct is not null then
        new.amount_before_discount := base;
        new.amount_due := round((base * (100 - new.discount_pct) / 100.0)::numeric);
      else
        new.amount_due := base;
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.orders_account_price() from public, anon, authenticated;

create trigger orders_account_price before insert or update on public.orders
  for each row execute function public.orders_account_price();

-- ---------- 2. branches ----------
alter table public.platform_settings
  add column branch_price integer not null default 299 check (branch_price between 0 and 100000);

alter table public.tenants add column parent_tenant_id text references public.tenants (id) on delete set null;
create index tenants_parent_idx on public.tenants (parent_tenant_id) where parent_tenant_id is not null;

-- Server-only (service role): a manager opens another branch. It copies the main business's price and UPI and
-- starts on the Free plan (no second trial). The manager switches between branches from the dashboard.
create or replace function public.add_branch(p_user uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  main record;
  new_id text := 'tenant-' || replace(gen_random_uuid()::text, '-', '');
  code text;
begin
  if char_length(coalesce(trim(p_name), '')) not between 2 and 80 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  select * into main from public.tenants where manager_id = p_user and parent_tenant_id is null order by created_at limit 1;
  if main.id is null then raise exception 'no_business' using errcode = 'P0001'; end if;
  if (select count(*) from public.tenants where manager_id = p_user) >= 20 then
    raise exception 'too_many_branches' using errcode = 'P0001';
  end if;
  insert into public.tenants (id, name, price_per_kg, currency, manager_id, upi_id, upi_name, plan_status, trial_ends_at, parent_tenant_id)
  values (new_id, trim(p_name), main.price_per_kg, main.currency, p_user, main.upi_id, main.upi_name, 'TRIAL', null, main.id)
  returning join_code into code;
  return jsonb_build_object('tenant_id', new_id, 'join_code', code);
end;
$$;
revoke execute on function public.add_branch(uuid, text) from public, anon, authenticated;

-- Subscription price: the main business pays the monthly price, an extra branch the branch price.
create or replace function public.submit_subscription_payment(p_months int, p_ref text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  ref text := upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'));
  price double precision;
  pct int;
  maxpct int;
  base double precision;
  credit double precision;
begin
  if public.auth_role() <> 'manager' or public.auth_tenant() is null then
    raise exception 'only_managers' using errcode = 'P0001';
  end if;
  if ref !~ '^[A-Z0-9]{6,35}$' then raise exception 'invalid_reference' using errcode = 'P0001'; end if;
  if p_months not between 1 and 12 then raise exception 'invalid_months' using errcode = 'P0001'; end if;
  select case when t.parent_tenant_id is null then s.monthly_price else s.branch_price end, s.credit_sub_max_pct
    into price, maxpct
    from public.platform_settings s, public.tenants t
   where s.id = 1 and t.id = public.auth_tenant();
  pct := public.subscription_discount(p_months);
  base := round((price * p_months * (100 - pct) / 100)::numeric);
  -- coalesce: least() skips nulls, so an unreadable balance must count as zero, not as "no limit"
  credit := least(floor(coalesce(public.tenant_credit_balance(public.auth_tenant()), 0)), floor(base * maxpct / 100.0));
  insert into public.subscription_payments (tenant_id, months, amount, discount_pct, credit_used, payment_ref)
  values (public.auth_tenant(), p_months, base - credit, pct, credit, ref);
end;
$$;
