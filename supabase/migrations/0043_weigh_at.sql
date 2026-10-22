-- 0043: where clothes are weighed (run after 0042).
-- A laundry chooses: at the door by the driver (as before), at the store (the driver just collects; the laundry
-- weighs and the bill follows), or the basket's own reading. A pickup collected without a weight is marked
-- weigh_pending until the laundry enters it; it can't be marked ready or charged automatically before that.

alter table public.tenants add column if not exists weigh_at text not null default 'door' check (weigh_at in ('door', 'store', 'basket'));
update public.tenants set weigh_at = 'basket' where weigh_at_pickup = false and weigh_at = 'door';

alter table public.orders add column if not exists weigh_pending boolean not null default false;
create index if not exists orders_weigh_pending_idx on public.orders (tenant_id) where weigh_pending;
