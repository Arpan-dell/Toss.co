-- Speed: indexes for the lookups the advisor and the code show are not covered yet, and one policy per action on
-- business_accounts and supplies so a read is checked against one policy instead of two.

-- foreign keys without a covering index (deleting or re-numbering an order had to scan drivers / devices)
create index if not exists devices_account_idx on public.devices (account_id) where account_id is not null;
create index if not exists drivers_weighing_order_idx on public.drivers (weighing_order_id) where weighing_order_id is not null;
create index if not exists drivers_photo_order_idx on public.drivers (photo_order_id) where photo_order_id is not null;
create index if not exists drivers_delivering_order_idx on public.drivers (delivering_order_id) where delivering_order_id is not null;

-- driver bot: today's completed pickups and the earnings card (driver + completed, by completion time)
create index if not exists orders_driver_done_idx on public.orders (driver_id, completed_at desc) where status = 'COMPLETED';
-- driver bot: deliveries made, by time (replaces the two-column index; same leading columns plus the time)
drop index if exists public.orders_delivery_driver_idx;
create index if not exists orders_delivery_driver_idx on public.orders (delivery_driver_id, delivery_status, delivered_at desc) where delivery_driver_id is not null;

-- "manager writes" was FOR ALL, so every SELECT also evaluated it next to "read". Same rules, split by action.
drop policy if exists "business_accounts: manager writes" on public.business_accounts;
create policy "business_accounts: manager inserts" on public.business_accounts for insert to authenticated
  with check (tenant_id = (select public.auth_tenant()) and (select public.auth_role()) = 'manager');
create policy "business_accounts: manager updates" on public.business_accounts for update to authenticated
  using (tenant_id = (select public.auth_tenant()) and (select public.auth_role()) = 'manager')
  with check (tenant_id = (select public.auth_tenant()) and (select public.auth_role()) = 'manager');
create policy "business_accounts: manager deletes" on public.business_accounts for delete to authenticated
  using (tenant_id = (select public.auth_tenant()) and (select public.auth_role()) = 'manager');

drop policy if exists "supplies: manager writes" on public.supplies;
create policy "supplies: manager inserts" on public.supplies for insert to authenticated
  with check (tenant_id = (select public.auth_tenant()) and (select public.auth_role()) = 'manager');
create policy "supplies: manager updates" on public.supplies for update to authenticated
  using (tenant_id = (select public.auth_tenant()) and (select public.auth_role()) = 'manager')
  with check (tenant_id = (select public.auth_tenant()) and (select public.auth_role()) = 'manager');
create policy "supplies: manager deletes" on public.supplies for delete to authenticated
  using (tenant_id = (select public.auth_tenant()) and (select public.auth_role()) = 'manager');
