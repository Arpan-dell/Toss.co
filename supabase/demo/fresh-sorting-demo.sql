-- DEMO ONLY (not a migration): shows "whites and coloured clothes kept apart" in the demo store Fresh (B-E2ZRFP).
-- Run in the Supabase SQL Editor AFTER migration 0025. It touches only demo rows: orders from baskets whose ID
-- starts with "demo-", and supplies whose name ends in "(demo)". To undo it, run the block at the bottom.
do $$
declare
  t text;
begin
  select id into t from public.tenants where join_code = 'B-E2ZRFP';
  if t is null then raise exception 'Fresh (B-E2ZRFP) not found'; end if;

  -- 1. Fresh sorts at pickup (sorting needs weighing on)
  update public.tenants set weigh_at_pickup = true, sort_whites = true where id = t;

  -- 2. The latest six demo pickups are still being washed (they fill the live board's "To wash" card)
  update public.orders
     set ready_at = null, ready_by = completed_at + interval '48 hours'
   where id in (
     select id from public.orders
      where tenant_id = t and device_id like 'demo-%' and status = 'COMPLETED'
      order by completed_at desc limit 6
   );

  -- 3. Demo pickups of the last 45 days were bagged apart: 20-49% whites, varying per order; every 7th is all coloured
  update public.orders o
     set whites_kg = s.w, coloured_kg = round((o.weight_kg - s.w)::numeric, 2)
    from (
      select id,
             case when abs(hashtext(id)) % 7 = 0 then 0
                  else round((weight_kg * (0.2 + (abs(hashtext(id)) % 30) / 100.0))::numeric, 1)::double precision end as w
        from public.orders
       where tenant_id = t and device_id like 'demo-%' and status = 'COMPLETED' and weight_kg > 0
         and completed_at > now() - interval '45 days'
    ) s
   where o.id = s.id;

  -- 4. Demo supplies, including whites-only and coloured-only ones. Added after the bags are split, so the split
  --    doesn't count past pickups against them. Bleach starts just under its alert level to show "Low" + reorder.
  delete from public.supplies where tenant_id = t and name like '% (demo)';
  insert into public.supplies (tenant_id, name, unit, per_kg, per_order, stock, low_at, cost_per_unit, applies_to) values
    (t, 'Detergent (demo)',    'ml',  15, 0, 9000, 2000, 0.20, 'ALL'),
    (t, 'Laundry bags (demo)', 'pcs',  0, 2,  160,   40, 3.00, 'ALL'),
    (t, 'Bleach (demo)',       'ml',   8, 0,  450,  500, 0.15, 'WHITES'),
    (t, 'Colour care (demo)',  'ml',   5, 0, 2600,  600, 0.30, 'COLOURED');
end $$;

-- Check: what Fresh now has to wash
select round(sum(whites_kg)::numeric, 1) as whites_kg, round(sum(coloured_kg)::numeric, 1) as coloured_kg, count(*) as orders
  from public.orders
 where tenant_id = (select id from public.tenants where join_code = 'B-E2ZRFP')
   and status = 'COMPLETED' and ready_at is null;

/* ---- UNDO (select and run only this block) ----
update public.tenants set sort_whites = false where join_code = 'B-E2ZRFP';
delete from public.supplies where name like '% (demo)' and tenant_id = (select id from public.tenants where join_code = 'B-E2ZRFP');
update public.orders set whites_kg = null, coloured_kg = null
 where device_id like 'demo-%' and tenant_id = (select id from public.tenants where join_code = 'B-E2ZRFP');
*/
