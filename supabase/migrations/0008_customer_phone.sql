-- Customers are identified by their mobile number (one account per number). The Telegram account
-- attaches automatically: opening Toss from the customer bot (Mini App), or Log in with Telegram,
-- which also returns the Telegram-verified number.

alter table public.customers
  add column phone text unique check (phone ~ '^\+[1-9][0-9]{7,14}$'), -- E.164, e.g. +919876543210
  add column phone_verified boolean not null default false;             -- true once Telegram confirmed it

-- Sign-up passes the (already normalised) number in user metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare p text := nullif(trim(new.raw_user_meta_data ->> 'phone'), '');
begin
  insert into public.customers (id, email, name, phone)
  values (
    new.id,
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    case when p ~ '^\+[1-9][0-9]{7,14}$' then p end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
