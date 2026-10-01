-- 1. Subscription discounts for longer plans (set by the Toss owner).
-- 2. Win-back offers: a customer who stops ordering gets a discount on their next pickup.
-- 3. Customer phone numbers are private: not readable by managers; drivers get them server-side.

-- ---------- 1. subscription discounts ----------
alter table public.platform_settings
  add column discount_3m int not null default 10 check (discount_3m between 0 and 90),
  add column discount_6m int not null default 15 check (discount_6m between 0 and 90),
  add column discount_12m int not null default 25 check (discount_12m between 0 and 90);

alter table public.subscription_payments
  add column discount_pct int not null default 0;

-- The discount tier for a number of months (1-2: none, 3-5, 6-11, 12).
create or replace function public.subscription_discount(p_months int)
returns int language sql stable security invoker set search_path = ''
as $$
  select case when p_months >= 12 then discount_12m when p_months >= 6 then discount_6m when p_months >= 3 then discount_3m else 0 end
  from public.platform_settings where id = 1;
$$;

create or replace function public.submit_subscription_payment(p_months int, p_ref text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  ref text := upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'));
  price double precision;
  pct int;
begin
  if public.auth_role() <> 'manager' or public.auth_tenant() is null then
    raise exception 'only_managers' using errcode = 'P0001';
  end if;
  if ref !~ '^[A-Z0-9]{6,35}$' then raise exception 'invalid_reference' using errcode = 'P0001'; end if;
  if p_months not between 1 and 12 then raise exception 'invalid_months' using errcode = 'P0001'; end if;
  select monthly_price into price from public.platform_settings where id = 1;
  pct := public.subscription_discount(p_months);
  -- Same formula as subscriptionQuote() in src/lib/pricing.ts, so the UPI amount and the record match.
  insert into public.subscription_payments (tenant_id, months, amount, discount_pct, payment_ref)
  values (public.auth_tenant(), p_months, round((price * p_months * (100 - pct) / 100)::numeric), pct, ref);
end;
$$;

-- ---------- 2. win-back offers ----------
alter table public.tenants
  add column winback_enabled boolean not null default true,
  add column winback_days int not null default 30 check (winback_days between 7 and 365),
  add column winback_pct int not null default 10 check (winback_pct between 1 and 50);
grant update (winback_enabled, winback_days, winback_pct) on public.tenants to authenticated;

alter table public.orders
  add column discount_pct int check (discount_pct between 1 and 90),
  add column amount_before_discount double precision;

create table public.customer_offers (
  id bigint generated always as identity primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  percent int not null check (percent between 1 and 90),
  reason text not null default 'WINBACK',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  notified_at timestamptz,
  order_id text references public.orders (id) on delete set null,
  redeemed_at timestamptz
);
create index customer_offers_open_idx on public.customer_offers (customer_id, tenant_id) where redeemed_at is null;
create index customer_offers_tenant_idx on public.customer_offers (tenant_id);
create index customer_offers_order_idx on public.customer_offers (order_id);

alter table public.customer_offers enable row level security;
create policy "customer_offers: read" on public.customer_offers for select to authenticated using (
  customer_id = (select auth.uid()) or (select public.is_owner()) or tenant_id = (select public.auth_tenant())
);
-- Written only by the server (service role).
revoke insert, update, delete on public.customer_offers from anon, authenticated;

-- Daily job: offers for customers whose last pickup is older than their laundry's win-back window.
-- One offer per quiet spell: nothing new until they order again. Returns what to announce.
create or replace function public.create_winback_offers()
returns table (offer_id bigint, telegram_id text, business text, percent int, expires_at timestamptz)
language sql security definer set search_path = ''
as $$
  with last as (
    select o.customer_id, o.tenant_id, max(o.placed_at) as last_at
    from public.orders o
    where o.customer_id is not null and o.tenant_id is not null and o.status <> 'CANCELLED'
    group by o.customer_id, o.tenant_id
  ), due as (
    select l.customer_id, l.tenant_id, t.winback_pct
    from last l
    join public.tenants t on t.id = l.tenant_id and t.winback_enabled and t.plan_status <> 'SUSPENDED'
    join public.customers c on c.id = l.customer_id and c.tenant_id = l.tenant_id
    where l.last_at < now() - make_interval(days => t.winback_days)
      and not exists (
        select 1 from public.customer_offers f
        where f.customer_id = l.customer_id and f.tenant_id = l.tenant_id and f.created_at > l.last_at
      )
  ), ins as (
    insert into public.customer_offers (tenant_id, customer_id, percent, expires_at)
    select d.tenant_id, d.customer_id, d.winback_pct, now() + interval '14 days' from due d
    returning id, customer_id, tenant_id, percent, expires_at
  )
  select ins.id, c.telegram_id, t.name, ins.percent, ins.expires_at
  from ins
  join public.customers c on c.id = ins.customer_id
  join public.tenants t on t.id = ins.tenant_id;
$$;

-- Applies the customer's open offer to a new order (called by ingest). Returns null when there is none.
create or replace function public.apply_customer_offer(p_order text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  o record;
  f record;
  after double precision;
begin
  select id, customer_id, tenant_id, amount_due, discount_pct, placed_at, status into o
  from public.orders where id = p_order for update;
  if o.id is null or o.customer_id is null or o.tenant_id is null or o.discount_pct is not null or o.status = 'CANCELLED' then
    return null;
  end if;
  select id, percent into f from public.customer_offers
  where customer_id = o.customer_id and tenant_id = o.tenant_id and redeemed_at is null
    and expires_at > now() and created_at <= o.placed_at
  order by percent desc, created_at
  limit 1 for update skip locked;
  if f.id is null then return null; end if;

  after := round((o.amount_due * (100 - f.percent) / 100)::numeric);
  update public.orders set amount_before_discount = o.amount_due, amount_due = after, discount_pct = f.percent where id = o.id;
  update public.customer_offers set redeemed_at = now(), order_id = o.id where id = f.id;
  return jsonb_build_object('percent', f.percent, 'before', o.amount_due, 'after', after);
end;
$$;

revoke execute on function public.create_winback_offers() from public, anon, authenticated;
revoke execute on function public.apply_customer_offer(text) from public, anon, authenticated;
revoke execute on function public.subscription_discount(int) from public, anon;
grant execute on function public.subscription_discount(int) to authenticated;

-- ---------- 3. phone privacy ----------
-- Managers (and everyone else on the client side) can no longer read customers.phone.
revoke select on public.customers from anon, authenticated;
grant select (id, customer_code, tenant_id, email, name, phone_verified, telegram_id, created_at, updated_at)
  on public.customers to authenticated;

-- A customer reads their own number through this.
create or replace function public.my_phone()
returns text language sql stable security definer set search_path = ''
as $$ select phone from public.customers where id = (select auth.uid()); $$;
revoke execute on function public.my_phone() from public, anon;
grant execute on function public.my_phone() to authenticated;
