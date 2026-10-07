-- Promised turnaround and ratings.
-- Each laundry promises a turnaround (48 h by default). When a pickup is completed the order gets a ready_by time;
-- the manager marks it ready (the customer is told on Telegram), and anything past ready_by and not ready is late.
-- Once an order is paid, the customer gets a link to rate it (a random per-order token, so no sign-in is needed);
-- happy customers are pointed at the laundry's Google review page.

alter table public.tenants
  add column turnaround_hours int not null default 48 check (turnaround_hours between 1 and 720),
  add column google_review_url text check (google_review_url is null or google_review_url ~ '^https://');
grant update (turnaround_hours, google_review_url) on public.tenants to authenticated;

alter table public.orders
  add column ready_by timestamptz,
  add column ready_at timestamptz,
  add column rate_token text unique,
  add column rating smallint check (rating between 1 and 5),
  add column rating_comment text check (rating_comment is null or char_length(rating_comment) <= 500),
  add column rated_at timestamptz;
create index orders_late_idx on public.orders (tenant_id, ready_by) where ready_at is null and status = 'COMPLETED';
create index orders_rated_idx on public.orders (tenant_id, rated_at desc) where rating is not null;

-- Managers can mark an order ready (and set its promise); ratings are written only by the server.
grant update (ready_at, ready_by) on public.orders to authenticated;

-- The promise starts when the pickup is completed.
create or replace function public.orders_set_ready_by()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare h int;
begin
  if new.status = 'COMPLETED' and (tg_op = 'INSERT' or old.status is distinct from 'COMPLETED') and new.ready_by is null then
    select turnaround_hours into h from public.tenants where id = new.tenant_id;
    new.ready_by := coalesce(new.completed_at, now()) + make_interval(hours => coalesce(h, 48));
  end if;
  if new.rate_token is null and new.payment_status = 'PAID' then
    new.rate_token := encode(extensions.gen_random_bytes(16), 'hex');
  end if;
  return new;
end;
$$;
revoke execute on function public.orders_set_ready_by() from public, anon, authenticated;

create trigger orders_set_ready_by before insert or update on public.orders
  for each row execute function public.orders_set_ready_by();

-- Existing completed orders: give them a promise from their completion time, so the late list starts sensible
-- (anything older than its promise is treated as already ready).
update public.orders o
   set ready_by = coalesce(o.completed_at, o.placed_at) + make_interval(hours => t.turnaround_hours),
       ready_at = case when coalesce(o.completed_at, o.placed_at) + make_interval(hours => t.turnaround_hours) < now()
                       then coalesce(o.completed_at, o.placed_at) + make_interval(hours => t.turnaround_hours) end
  from public.tenants t
 where t.id = o.tenant_id and o.status = 'COMPLETED' and o.ready_by is null;
update public.orders set rate_token = encode(extensions.gen_random_bytes(16), 'hex') where payment_status = 'PAID' and rate_token is null;
