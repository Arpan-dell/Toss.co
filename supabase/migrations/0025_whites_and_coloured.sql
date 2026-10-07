-- Whites and coloured clothes, kept apart from pickup.
-- When a laundry turns on sort_whites, the driver packs whites and coloured clothes in two tagged bags at pickup
-- and weighs each one in the driver bot. The order keeps both weights (the billed weight is their sum), so the
-- laundry can plan white and coloured washes, and supplies used only for one kind (bleach, colour care) come off
-- that kind's weight.

alter table public.tenants add column sort_whites boolean not null default false;

alter table public.orders
  add column whites_kg double precision check (whites_kg is null or whites_kg >= 0),
  add column coloured_kg double precision check (coloured_kg is null or coloured_kg >= 0);

-- Bot-only state: which bag the driver is weighing for drivers.weighing_order_id.
alter table public.drivers add column weighing_step text check (weighing_step in ('WHITES', 'COLOURED'));

-- A supply can be used for every wash, or only for whites or only for coloured clothes.
alter table public.supplies add column applies_to text not null default 'ALL' check (applies_to in ('ALL', 'WHITES', 'COLOURED'));

-- Stock follows completed pickups (replaces 0021's version): whites-only and coloured-only supplies use that
-- kind's weight; an order whose bags weren't sorted counts only towards supplies used for every wash.
create or replace function public.orders_use_supplies()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  kg double precision := 0;
  w double precision := 0;
  c double precision := 0;
  n int := 0;
  nw int := 0;
  nc int := 0;
  ow double precision := coalesce(old.whites_kg, 0);
  oc double precision := coalesce(old.coloured_kg, 0);
  neww double precision := coalesce(new.whites_kg, 0);
  newc double precision := coalesce(new.coloured_kg, 0);
begin
  if new.tenant_id is null then return null; end if;
  if old.status <> 'COMPLETED' and new.status = 'COMPLETED' then
    kg := coalesce(new.weight_kg, 0); w := neww; c := newc; n := 1;
    nw := (neww > 0)::int; nc := (newc > 0)::int;
  elsif old.status = 'COMPLETED' and new.status = 'COMPLETED' then
    kg := coalesce(new.weight_kg, 0) - coalesce(old.weight_kg, 0); w := neww - ow; c := newc - oc;
    nw := (neww > 0)::int - (ow > 0)::int; nc := (newc > 0)::int - (oc > 0)::int;
  elsif old.status = 'COMPLETED' and new.status <> 'COMPLETED' then
    kg := -coalesce(old.weight_kg, 0); w := -ow; c := -oc; n := -1; -- e.g. cancelled after the fact: put it back
    nw := -(ow > 0)::int; nc := -(oc > 0)::int;
  end if;
  if kg <> 0 or w <> 0 or c <> 0 or n <> 0 or nw <> 0 or nc <> 0 then
    update public.supplies
       set stock = stock - case applies_to
                             when 'WHITES' then per_kg * w + per_order * nw
                             when 'COLOURED' then per_kg * c + per_order * nc
                             else per_kg * kg + per_order * n
                           end,
           updated_at = now()
     where tenant_id = new.tenant_id and (per_kg > 0 or per_order > 0);
  end if;
  return null;
end;
$$;
revoke execute on function public.orders_use_supplies() from public, anon, authenticated;

drop trigger orders_use_supplies on public.orders;
create trigger orders_use_supplies after update of status, weight_kg, whites_kg, coloured_kg on public.orders
  for each row when (
    old.status is distinct from new.status or old.weight_kg is distinct from new.weight_kg
    or old.whites_kg is distinct from new.whites_kg or old.coloured_kg is distinct from new.coloured_kg
  )
  execute function public.orders_use_supplies();
