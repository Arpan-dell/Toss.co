-- Service areas and the public laundry directory.
--
-- Each business serves a circle around its store (1-20 km) and can choose whether it is listed. Customers
-- who don't know any laundry can search by location (website or the Telegram Mini App), compare the
-- businesses that cover them, and connect to one. Store coordinates are only returned rounded (~100 m), and
-- internal IDs never leave the database: the Business ID (join code) is what customers use.

alter table public.tenants
  add column if not exists service_radius_km integer not null default 10 check (service_radius_km between 1 and 20),
  add column if not exists listed boolean not null default true;

alter table public.customers
  add column if not exists home_lat double precision check (home_lat between -90 and 90),
  add column if not exists home_lng double precision check (home_lng between -180 and 180);

-- Great-circle distance in km.
create or replace function public.km_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- Businesses whose service area covers (p_lat, p_lng): listed, located, not suspended, on a live trial or plan.
create or replace function public.nearby_businesses(p_lat double precision, p_lng double precision)
returns table (
  join_code text,
  name text,
  price_per_kg double precision,
  store_address text,
  distance_km double precision,
  radius_km integer,
  drivers_ready integer,
  pickups_30d integer,
  avg_accept_mins integer,
  customers integer,
  since timestamptz,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select tn.*, public.km_between(p_lat, p_lng, tn.store_lat, tn.store_lng) as d
    from public.tenants tn
    where p_lat between -90 and 90 and p_lng between -180 and 180
      and tn.listed
      and tn.store_lat is not null and tn.store_lng is not null
      and tn.plan_status is distinct from 'SUSPENDED'
      and (tn.paid_until > now() or tn.trial_ends_at > now())
  )
  select
    t.join_code,
    t.name,
    t.price_per_kg,
    t.store_address,
    round(t.d::numeric, 1)::double precision,
    t.service_radius_km,
    (select count(*) from public.drivers d where d.tenant_id = t.id and d.telegram_chat_id is not null and d.status in ('AVAILABLE', 'ON_JOB'))::integer,
    -- placed_at is when the basket asked (created_at can be a later import time)
    (select count(*) from public.orders o where o.tenant_id = t.id and coalesce(o.placed_at, o.created_at) > now() - interval '30 days')::integer,
    (select round(avg(extract(epoch from (o.accepted_at - coalesce(o.placed_at, o.created_at))) / 60))::integer
       from public.orders o
       where o.tenant_id = t.id and o.accepted_at >= coalesce(o.placed_at, o.created_at)
         and coalesce(o.placed_at, o.created_at) > now() - interval '90 days'),
    (select count(*) from public.customers c where c.tenant_id = t.id)::integer,
    t.created_at,
    round(t.store_lat::numeric, 3)::double precision,
    round(t.store_lng::numeric, 3)::double precision
  from t
  where t.d <= t.service_radius_km
  order by t.d
  limit 40;
$$;

revoke all on function public.nearby_businesses(double precision, double precision) from public;
grant execute on function public.nearby_businesses(double precision, double precision) to anon, authenticated;

-- A customer picks (or switches to) a business. Their baskets move with them so the next pickup goes to the
-- new laundry; switching waits while a pickup is in progress. Optionally remembers where they searched from.
create or replace function public.choose_business(p_code text, p_lat double precision default null, p_lng double precision default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  uid uuid := auth.uid();
  tg text;
  cur text;
begin
  if uid is null or public.auth_role() <> 'customer' then
    raise exception 'only_customers_can_join' using errcode = 'P0001';
  end if;
  select id, name, plan_status into t from public.tenants where join_code = upper(trim(p_code));
  if t.id is null then raise exception 'unknown_business_id' using errcode = 'P0002'; end if;
  if t.plan_status = 'SUSPENDED' then raise exception 'business_suspended' using errcode = 'P0001'; end if;

  select tenant_id, telegram_id into cur, tg from public.customers where id = uid;
  if cur is not null and cur <> t.id and exists (
    select 1 from public.orders o
    where o.tenant_id = cur and o.status in ('PENDING', 'ACCEPTED')
      and (o.customer_id = uid or (tg is not null and o.customer_telegram_id = tg))
  ) then
    raise exception 'pickup_in_progress' using errcode = 'P0001';
  end if;

  update public.customers
    set tenant_id = t.id,
        home_lat = case when p_lat between -90 and 90 and p_lng between -180 and 180 then p_lat else home_lat end,
        home_lng = case when p_lat between -90 and 90 and p_lng between -180 and 180 then p_lng else home_lng end
    where id = uid;
  update public.devices set tenant_id = t.id
    where (tenant_id is null or tenant_id <> t.id) and (customer_id = uid or (tg is not null and owner_telegram_id = tg));
  update public.orders set tenant_id = t.id
    where tenant_id is null and (customer_id = uid or (tg is not null and customer_telegram_id = tg));
  return jsonb_build_object('tenant_id', t.id, 'name', t.name);
end;
$$;

revoke all on function public.choose_business(text, double precision, double precision) from public;
grant execute on function public.choose_business(text, double precision, double precision) to authenticated;

-- Joining by Business ID goes through the same path, so a switch by code also moves the basket.
create or replace function public.join_tenant(p_code text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.choose_business(p_code, null, null);
$$;
