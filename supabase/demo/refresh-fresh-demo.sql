-- DEMO ONLY (not a migration): brings the demo store Fresh (B-E2ZRFP) up to today, so the manager portal looks
-- like a working day instead of a store that stopped weeks ago. Safe to re-run whenever the demo looks stale.
-- It touches only demo rows: orders from baskets whose ID starts with "demo-", those baskets, and the demo drivers
-- (chat IDs 7100…). Real customers, drivers and orders are never changed.
--
-- 1. Moves every demo order forward by whole days, so the newest lands today and weekday times stay the same.
-- 2. Sets up a live moment: one pickup waiting for a driver, one driver on the way, the latest pickups in the wash,
--    three deliveries (waiting, assigned, out), a few unpaid invoices and two UPI payments to confirm.
-- 3. Marks six demo baskets online.
do $$
declare
  t text;
  gap int;
  price numeric;
begin
  select id, price_per_kg into t, price from public.tenants where join_code = 'B-E2ZRFP';
  if t is null then raise exception 'Fresh (B-E2ZRFP) not found'; end if;

  -- 1. Shift. Whole days (rounded up); an order that would land in the last hour or the future moves one day less.
  select ceil(extract(epoch from now() - max(placed_at)) / 86400)::int into gap
    from public.orders where tenant_id = t and device_id like 'demo-%' and id not like '%#300';
  if gap > 0 then
    update public.orders o set
      placed_at = placed_at + s.d, accepted_at = accepted_at + s.d, completed_at = completed_at + s.d,
      created_at = created_at + s.d, assigned_at = assigned_at + s.d, driver_ack_at = driver_ack_at + s.d,
      payment_reported_at = payment_reported_at + s.d, payment_confirmed_at = payment_confirmed_at + s.d,
      invoice_issued_at = invoice_issued_at + s.d, invoice_sent_at = invoice_sent_at + s.d,
      weighed_at = weighed_at + s.d, ready_by = ready_by + s.d, ready_at = ready_at + s.d, rated_at = rated_at + s.d,
      pickup_photo_at = pickup_photo_at + s.d, delivery_assigned_at = delivery_assigned_at + s.d,
      out_for_delivery_at = out_for_delivery_at + s.d, delivered_at = delivered_at + s.d,
      delivery_ack_at = delivery_ack_at + s.d
    from (
      select id, make_interval(days => case when placed_at + make_interval(days => gap) > now() - interval '1 hour'
                                            then gap - 1 else gap end) as d
        from public.orders where tenant_id = t and device_id like 'demo-%'
    ) s
    where o.id = s.id;
    update public.order_events set at = at + make_interval(days => gap), created_at = created_at + make_interval(days => gap)
     where order_id like 'demo-%';
  end if;

  -- Nothing may end up in the future (a pickup placed an hour ago can't have been washed three hours later).
  update public.orders set
    accepted_at = case when accepted_at > now() then now() - interval '20 minutes' else accepted_at end,
    completed_at = case when completed_at > now() then now() - interval '10 minutes' else completed_at end,
    payment_confirmed_at = case when payment_confirmed_at > now() then now() else payment_confirmed_at end,
    payment_reported_at = case when payment_reported_at > now() then now() else payment_reported_at end,
    ready_at = case when ready_at > now() then null else ready_at end,
    delivered_at = case when delivered_at > now() then now() else delivered_at end,
    rated_at = case when rated_at > now() then now() else rated_at end
  where tenant_id = t and device_id like 'demo-%';

  -- 2a. Deliveries: three pickups from 2–4 days ago are washed and going home.
  with picked as (
    select id, row_number() over (order by placed_at desc) rn from public.orders
     where tenant_id = t and device_id like 'demo-%' and status = 'COMPLETED' and id not like '%#300'
       and placed_at between now() - interval '4 days' and now() - interval '2 days'
     order by placed_at desc limit 3
  )
  update public.orders o set
    ready_at = now() - case p.rn when 1 then interval '40 minutes' else interval '3 hours' end,
    delivery_status = case p.rn when 1 then 'WAITING' when 2 then 'ASSIGNED' else 'OUT' end,
    delivery_driver_id = case p.rn when 1 then null when 2 then '7100000002' else '7100000003' end,
    delivery_assigned_at = case p.rn when 1 then null when 2 then now() - interval '10 minutes' else now() - interval '35 minutes' end,
    delivery_ack_at = case p.rn when 1 then null when 2 then now() - interval '8 minutes' else now() - interval '33 minutes' end,
    out_for_delivery_at = case p.rn when 3 then now() - interval '20 minutes' end,
    delivered_at = null, delivery_attempts = 0, delivery_declined_by = null
  from picked p where o.id = p.id;

  -- 2b. The latest pickups (last 2 days) are still in the wash.
  update public.orders set ready_at = null, ready_by = completed_at + interval '48 hours', delivery_status = null,
         delivery_driver_id = null, delivery_assigned_at = null, out_for_delivery_at = null, delivered_at = null, delivery_ack_at = null
   where tenant_id = t and device_id like 'demo-%' and status = 'COMPLETED' and id not like '%#300'
     and placed_at > now() - interval '2 days';

  -- 2c. Recent payments: the newest invoices a mix of unpaid and "paid by UPI, please confirm".
  with recent as (
    select id, completed_at, row_number() over (order by placed_at desc) rn from public.orders
     where tenant_id = t and device_id like 'demo-%' and status = 'COMPLETED' and id not like '%#300'
       and placed_at > now() - interval '4 days'
  )
  update public.orders o set
    payment_status = case when r.rn in (1, 4, 7) then 'UNPAID' when r.rn in (2, 5) then 'PENDING' else 'PAID' end,
    payment_method = case when r.rn in (1, 4, 7) then null when r.rn in (2, 5) then 'UPI' else coalesce(o.payment_method, 'UPI') end,
    payment_ref = case when r.rn in (1, 4, 7) then null
                       when r.rn in (2, 5) then lpad((abs(hashtext(o.id)) % 1000000000000)::text, 12, '4')
                       else o.payment_ref end,
    payment_reported_at = case when r.rn in (2, 5) then least(r.completed_at + interval '1 hour', now() - interval '15 minutes') end,
    payment_confirmed_at = case when r.rn in (1, 2, 4, 5, 7) then null else coalesce(o.payment_confirmed_at, r.completed_at + interval '2 hours') end
  from recent r where o.id = r.id;

  -- 2d. Two live pickups: Rajouri Garden's basket just filled up and is waiting for a driver; Vikram is on his way
  --     to Dwarka.
  insert into public.orders (id, device_order_id, device_id, tenant_id, customer_id, customer_telegram_id, driver_id, address,
                             weight_kg, reported_weight_kg, status, amount_due, placed_at, accepted_at, assigned_at,
                             driver_ack_at, payment_status, created_at)
  select d.device_id || '#300', 300, d.device_id, t, d.customer_id, d.owner_telegram_id,
         case when d.device_id = 'demo-basket-05' then '7100000001' end, d.address,
         d.target_kg + 0.2, d.target_kg + 0.2, case when d.device_id = 'demo-basket-05' then 'ACCEPTED' else 'PENDING' end,
         round((d.target_kg + 0.2) * price),
         now() - case when d.device_id = 'demo-basket-05' then interval '22 minutes' else interval '6 minutes' end,
         case when d.device_id = 'demo-basket-05' then now() - interval '15 minutes' end,
         case when d.device_id = 'demo-basket-05' then now() - interval '15 minutes' end,
         case when d.device_id = 'demo-basket-05' then now() - interval '14 minutes' end,
         'UNPAID', now()
    from public.devices d where d.device_id in ('demo-basket-04', 'demo-basket-05') and d.tenant_id = t
  on conflict (id) do update set
    status = excluded.status, driver_id = excluded.driver_id, placed_at = excluded.placed_at, accepted_at = excluded.accepted_at,
    assigned_at = excluded.assigned_at, driver_ack_at = excluded.driver_ack_at, completed_at = null, payment_status = 'UNPAID',
    payment_method = null, payment_ref = null, payment_reported_at = null, payment_confirmed_at = null,
    ready_at = null, ready_by = null, delivery_status = null, delivered_at = null;

  -- 3. Baskets: six online (seen "just now" for the next week), two quiet for a few hours. The two that just
  --    called a pickup show a full load.
  update public.devices set last_seen_at = case when device_id <= 'demo-basket-06' then now() + interval '7 days'
                                                 else now() - interval '5 hours' end
   where tenant_id = t and device_id like 'demo-%';
  update public.devices set last_weight_kg = target_kg + 0.2
   where tenant_id = t and device_id in ('demo-basket-04', 'demo-basket-05');

  update public.drivers set status = case telegram_chat_id when '7100000002' then 'AVAILABLE' else 'ON_JOB' end
   where tenant_id = t and telegram_chat_id like '7100%';
end $$;

-- Check: what the live board shows now
select
  count(*) filter (where status = 'PENDING') as waiting_for_driver,
  count(*) filter (where status = 'ACCEPTED') as driver_on_the_way,
  count(*) filter (where status = 'COMPLETED' and ready_at is null) as in_the_wash,
  count(*) filter (where delivery_status in ('WAITING', 'ASSIGNED', 'OUT')) as deliveries,
  count(*) filter (where payment_status = 'UNPAID') as unpaid,
  count(*) filter (where payment_status = 'PENDING') as to_confirm,
  count(*) filter (where placed_at::date = now()::date) as today,
  max(placed_at) as newest
from public.orders
where tenant_id = (select id from public.tenants where join_code = 'B-E2ZRFP') and device_id like 'demo-%';
