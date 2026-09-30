-- Performance fixes from the Supabase advisor (no behaviour change):
-- 1. Evaluate auth.uid() / is_manager() once per query, not once per row: wrap them in (select …).
-- 2. Managers' write policies were FOR ALL, which overlapped the SELECT policies. Split them into
--    insert/update/delete so each action has exactly one permissive policy.
-- 3. Index the foreign keys that had no covering index.

-- ---------- tenants ----------
drop policy "tenants: signed-in users read" on public.tenants;
drop policy "tenants: managers write" on public.tenants;
create policy "tenants: signed-in users read" on public.tenants for select to authenticated using (true);
create policy "tenants: managers insert" on public.tenants for insert to authenticated with check ((select public.is_manager()));
create policy "tenants: managers update" on public.tenants for update to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));
create policy "tenants: managers delete" on public.tenants for delete to authenticated using ((select public.is_manager()));

-- ---------- customers ----------
drop policy "customers: read own or manager" on public.customers;
drop policy "customers: managers write" on public.customers;
create policy "customers: read own or manager" on public.customers for select to authenticated
  using (id = (select auth.uid()) or (select public.is_manager()));
create policy "customers: managers insert" on public.customers for insert to authenticated with check ((select public.is_manager()));
create policy "customers: managers update" on public.customers for update to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));
create policy "customers: managers delete" on public.customers for delete to authenticated using ((select public.is_manager()));

-- ---------- devices ----------
drop policy "devices: read own or manager" on public.devices;
drop policy "devices: managers write" on public.devices;
create policy "devices: read own or manager" on public.devices for select to authenticated
  using (customer_id = (select auth.uid()) or (select public.is_manager()));
create policy "devices: managers insert" on public.devices for insert to authenticated with check ((select public.is_manager()));
create policy "devices: managers update" on public.devices for update to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));
create policy "devices: managers delete" on public.devices for delete to authenticated using ((select public.is_manager()));

-- ---------- drivers ----------
drop policy "drivers: managers only" on public.drivers;
create policy "drivers: managers only" on public.drivers for all to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));

-- ---------- orders ----------
drop policy "orders: read own or manager" on public.orders;
drop policy "orders: managers write" on public.orders;
create policy "orders: read own or manager" on public.orders for select to authenticated
  using (customer_id = (select auth.uid()) or (select public.is_manager()));
create policy "orders: managers insert" on public.orders for insert to authenticated with check ((select public.is_manager()));
create policy "orders: managers update" on public.orders for update to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));
create policy "orders: managers delete" on public.orders for delete to authenticated using ((select public.is_manager()));

-- ---------- order_events ----------
drop policy "order_events: managers read" on public.order_events;
create policy "order_events: managers read" on public.order_events for select to authenticated
  using ((select public.is_manager()));

-- ---------- foreign key indexes ----------
create index customers_tenant_idx on public.customers (tenant_id);
create index devices_tenant_idx on public.devices (tenant_id);
create index drivers_tenant_idx on public.drivers (tenant_id);
create index orders_device_idx on public.orders (device_id);
