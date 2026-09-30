-- Phase C: every Supabase Auth user gets a customers row, and Telegram accounts can be linked.

-- 1. Create the customers row when someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.customers (id, tenant_id, email, name)
  values (
    new.id,
    'tenant-delhi-01',
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Link a verified Telegram ID to a customer and attach everything that ID already owns.
--    Called only by the server (service role) after verifying the Telegram Login Widget hash.
create or replace function public.link_telegram(p_customer uuid, p_telegram_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
  linked_orders int;
  linked_devices int;
begin
  select id into owner from public.customers where telegram_id = p_telegram_id;
  if owner is not null and owner <> p_customer then
    raise exception 'telegram_already_linked' using errcode = 'P0001';
  end if;

  update public.customers set telegram_id = p_telegram_id where id = p_customer;
  if not found then
    raise exception 'customer_not_found' using errcode = 'P0002';
  end if;

  update public.orders set customer_id = p_customer
    where customer_telegram_id = p_telegram_id and customer_id is null;
  get diagnostics linked_orders = row_count;

  update public.devices set customer_id = p_customer
    where owner_telegram_id = p_telegram_id and customer_id is null;
  get diagnostics linked_devices = row_count;

  return jsonb_build_object('orders', linked_orders, 'devices', linked_devices);
end;
$$;

-- Only the server may call it: never anon or signed-in clients.
revoke execute on function public.link_telegram(uuid, text) from public, anon, authenticated;
grant execute on function public.link_telegram(uuid, text) to service_role;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 3. Backfill customers rows for anyone who signed up before this migration.
insert into public.customers (id, tenant_id, email, name)
select u.id, 'tenant-delhi-01', u.email, nullif(trim(u.raw_user_meta_data ->> 'full_name'), '')
from auth.users u
on conflict (id) do nothing;
