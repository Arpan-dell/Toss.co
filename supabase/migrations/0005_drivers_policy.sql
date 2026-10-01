-- One permissive policy per action on drivers (advisor: multiple_permissive_policies).
drop policy if exists "drivers: manager's business" on public.drivers;
drop policy if exists "drivers: owner reads" on public.drivers;

create policy "drivers: read" on public.drivers for select to authenticated
  using (tenant_id = (select public.auth_tenant()) or (select public.is_owner()));
create policy "drivers: manager insert" on public.drivers for insert to authenticated
  with check (tenant_id = (select public.auth_tenant()));
create policy "drivers: manager update" on public.drivers for update to authenticated
  using (tenant_id = (select public.auth_tenant())) with check (tenant_id = (select public.auth_tenant()));
create policy "drivers: manager delete" on public.drivers for delete to authenticated
  using (tenant_id = (select public.auth_tenant()));

-- Intentional: join_tenant, report_payment and submit_subscription_payment are SECURITY DEFINER and
-- callable by signed-in users. Each validates the caller itself (auth.uid(), role, tenant) and only
-- touches that caller's own rows. Everything that crosses tenants is service-role only.
