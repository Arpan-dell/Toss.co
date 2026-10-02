-- Driver weighs the bag at pickup. The basket's own reading (sent by the customer's device) prices the order
-- when it's placed; at pickup the driver types the scale reading and that becomes the billed weight. Both are
-- kept so the business can spot baskets that under-report. Written only by the server (driver bot).
alter table public.orders
  add column if not exists reported_weight_kg double precision,  -- what the basket said (kept from the first reading)
  add column if not exists weighed_kg double precision,          -- what the driver's scale said
  add column if not exists weighed_at timestamptz,
  add column if not exists weight_source text check (weight_source in ('driver', 'basket'));

-- The pickup a driver is weighing right now (their next numeric message is its weight). Bot-only state.
alter table public.drivers
  add column if not exists weighing_order_id text references public.orders (id) on delete set null;

-- Manager's choice (Business page): drivers must weigh every bag at pickup. Off: "Picked up" completes right
-- away with the basket's reading, as before.
alter table public.tenants add column if not exists weigh_at_pickup boolean not null default true;

-- A manager can confirm or correct the weight on an unpaid order (order page); recorded as 'manager'.
alter table public.orders drop constraint if exists orders_weight_source_check;
alter table public.orders add constraint orders_weight_source_check check (weight_source in ('driver', 'basket', 'manager'));
