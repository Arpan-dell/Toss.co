-- Driver dispatch: live driver locations, geocoded pickups, the laundry store as route end point,
-- and automatic assignment of new pickups to the nearest available driver.

-- Drivers report their position by sharing live location with the driver bot.
alter table public.drivers
  add column last_lat double precision,
  add column last_lng double precision,
  add column location_at timestamptz,
  add column max_jobs int not null default 3 check (max_jobs between 1 and 9),
  -- Secret in the "My route" link (/r/<token>): opens the driver's current route in Google Maps.
  add column route_token text not null unique default encode(extensions.gen_random_bytes(18), 'hex');

-- Pickup coordinates, geocoded from the basket's address (cached until the address changes).
alter table public.devices
  add column lat double precision,
  add column lng double precision,
  add column geocoded_address text;

-- Where drivers drop the laundry: the last stop of every route.
alter table public.tenants
  add column store_address text,
  add column store_lat double precision,
  add column store_lng double precision;

-- Dispatch bookkeeping on orders.
alter table public.orders
  add column assigned_at timestamptz,
  add column declined_by text[] not null default '{}'; -- driver chat IDs that passed on this pickup

-- Managers can set the store address and a driver's job limit; coordinates and live locations are
-- written only by the server (geocoder and driver bot webhook) with the service role.
grant update (store_address) on public.tenants to authenticated;
grant update (max_jobs) on public.drivers to authenticated;
-- Never expose the route link secret to client roles.
revoke select on public.drivers from anon, authenticated;
grant select (id, tenant_id, name, telegram_chat_id, status, created_at, updated_at, last_lat, last_lng, location_at, max_jobs)
  on public.drivers to authenticated;

create index orders_driver_active_idx on public.orders (driver_id) where status in ('PENDING', 'ACCEPTED');
