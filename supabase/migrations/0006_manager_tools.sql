-- Phase E: manager tools (customers, drivers, baskets, order overrides) and live updates.

-- ---------- tighter column permissions ----------
-- Baskets: managers may label them and set a target; never the device key, owner or business.
revoke update on public.devices from authenticated;
grant update (area, address, target_kg) on public.devices to authenticated;

-- Orders: on top of payment fields, managers may assign a driver and override status (e.g. a
-- driver forgot to tap Complete). Order identity, weight and placement stay device-owned.
grant update (status, driver_id, accepted_at, completed_at) on public.orders to authenticated;

-- Drivers: managers manage name, chat ID and status; never move a driver to another business.
revoke update on public.drivers from authenticated;
grant update (name, telegram_chat_id, status) on public.drivers to authenticated;

-- ---------- remove a customer from the business ----------
-- Their order history stays with this business; their baskets stop routing new orders here.
create or replace function public.remove_customer(p_customer uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare t text := public.auth_tenant();
begin
  if public.auth_role() <> 'manager' or t is null then
    raise exception 'only_managers' using errcode = 'P0001';
  end if;
  update public.customers set tenant_id = null where id = p_customer and tenant_id = t;
  if not found then raise exception 'customer_not_in_business' using errcode = 'P0002'; end if;
  update public.devices set tenant_id = null where customer_id = p_customer and tenant_id = t;
end;
$$;
revoke execute on function public.remove_customer(uuid) from public, anon;
grant execute on function public.remove_customer(uuid) to authenticated;

-- ---------- live updates ----------
-- Supabase Realtime broadcasts row changes; subscribers only receive rows their RLS lets them read.
alter publication supabase_realtime add table public.orders, public.devices, public.drivers;
