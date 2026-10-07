-- Deliveries: getting clean clothes back to the customer.
--
-- When the laundry marks an order ready, it either goes out for delivery (tenants.delivers, the default) or waits
-- at the store for the customer to collect it. A delivery is a second trip for a driver:
--   WAITING   ready at the store, no driver yet
--   ASSIGNED  a driver has it and is collecting the bags from the store
--   OUT       on the way to the customer
--   DELIVERED handed over (the customer read their 4-digit code to the driver, or the driver couldn't check it)
--   COLLECTED the customer picked it up at the store
-- "Customer not home" puts it back to WAITING and counts the attempt. Written only by the server (driver bot and
-- manager actions after their checks); managers and customers read it through RLS like the rest of the order.

alter table public.tenants add column delivers boolean not null default true;

alter table public.orders
  add column delivery_status text check (delivery_status in ('WAITING', 'ASSIGNED', 'OUT', 'DELIVERED', 'COLLECTED')),
  add column delivery_driver_id text, -- the driver's Telegram chat ID, like orders.driver_id
  add column delivery_assigned_at timestamptz,
  add column out_for_delivery_at timestamptz,
  add column delivered_at timestamptz,
  add column delivery_code text check (delivery_code is null or delivery_code ~ '^[0-9]{4}$'),
  add column delivery_verified boolean, -- true: the customer's code matched; false: delivered without it
  add column delivery_attempts int not null default 0,
  add column delivery_declined_by text[] not null default '{}';
create index orders_delivery_idx on public.orders (tenant_id, delivery_status) where delivery_status in ('WAITING', 'ASSIGNED', 'OUT');
create index orders_delivery_driver_idx on public.orders (delivery_driver_id, delivery_status) where delivery_driver_id is not null;

-- Bot-only state: the delivery whose handover code this driver is typing.
alter table public.drivers add column delivering_order_id text references public.orders (id) on delete set null;
