-- Supplies stock and running costs (Toss Pro).
-- A laundry lists what it uses per kg of washing (detergent, softener...) or per order (a bag), with its stock,
-- a low-stock level, the unit cost and the supplier's WhatsApp number. Stock comes down by itself when a pickup is
-- completed (and is corrected if the weight changes or a completed order is cancelled). Unit costs plus the
-- laundry's other running cost per kg and driver pay give the profit on each order (computed in the app).

create table public.supplies (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  unit text not null default 'ml' check (unit in ('ml', 'l', 'g', 'kg', 'pcs')),
  per_kg double precision not null default 0 check (per_kg between 0 and 100000),
  per_order double precision not null default 0 check (per_order between 0 and 100000),
  stock double precision not null default 0 check (stock between -1000000 and 100000000),
  low_at double precision not null default 0 check (low_at between 0 and 100000000),
  cost_per_unit double precision not null default 0 check (cost_per_unit between 0 and 100000),
  supplier_phone text check (supplier_phone is null or supplier_phone ~ '^\+[1-9][0-9]{7,14}$'),
  alerted_at timestamptz, -- low-stock email sent; cleared when restocked above low_at
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index supplies_tenant_idx on public.supplies (tenant_id);

alter table public.supplies enable row level security;
create policy "supplies: read" on public.supplies for select to authenticated using (
  tenant_id = (select public.auth_tenant()) or (select public.is_owner())
);
create policy "supplies: manager writes" on public.supplies for all to authenticated
  using (tenant_id = (select public.auth_tenant()) and (select public.auth_role()) = 'manager')
  with check (tenant_id = (select public.auth_tenant()) and (select public.auth_role()) = 'manager');

-- Running costs used for profit per order (and, with driver pay, by the driver payout page).
alter table public.tenants
  add column other_cost_per_kg double precision not null default 0 check (other_cost_per_kg between 0 and 10000),
  add column driver_pay_per_pickup double precision not null default 0 check (driver_pay_per_pickup between 0 and 100000),
  add column driver_pay_per_km double precision not null default 0 check (driver_pay_per_km between 0 and 10000);
grant update (other_cost_per_kg, driver_pay_per_pickup, driver_pay_per_km) on public.tenants to authenticated;

-- Stock follows completed pickups.
create or replace function public.orders_use_supplies()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  kg double precision := 0;
  n int := 0;
begin
  if new.tenant_id is null then return null; end if;
  if old.status <> 'COMPLETED' and new.status = 'COMPLETED' then
    kg := coalesce(new.weight_kg, 0); n := 1;
  elsif old.status = 'COMPLETED' and new.status = 'COMPLETED' then
    kg := coalesce(new.weight_kg, 0) - coalesce(old.weight_kg, 0);
  elsif old.status = 'COMPLETED' and new.status <> 'COMPLETED' then
    kg := -coalesce(old.weight_kg, 0); n := -1; -- e.g. cancelled after the fact: put it back
  end if;
  if kg <> 0 or n <> 0 then
    update public.supplies set stock = stock - (per_kg * kg + per_order * n), updated_at = now()
     where tenant_id = new.tenant_id and (per_kg > 0 or per_order > 0);
  end if;
  return null;
end;
$$;
revoke execute on function public.orders_use_supplies() from public, anon, authenticated;

create trigger orders_use_supplies after update of status, weight_kg on public.orders
  for each row when (old.status is distinct from new.status or old.weight_kg is distinct from new.weight_kg)
  execute function public.orders_use_supplies();
