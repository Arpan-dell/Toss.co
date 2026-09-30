-- Toss initial schema. Run in Supabase: SQL Editor → paste → Run (or `supabase db push`).
--
-- Access model
--   * Customers (signed in via Supabase Auth) read only their own rows: customer_id = auth.uid().
--   * Managers have app_metadata.role = 'manager' (settable only with the service role key).
--   * The device ingest API uses the service role key server-side and bypasses RLS.

-- ---------- helpers ----------
create or replace function public.is_manager()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'manager', false)
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- tables ----------
create table public.tenants (
  id text primary key,
  name text not null,
  price_per_kg double precision not null check (price_per_kg >= 0),
  currency text not null default 'INR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key references auth.users (id) on delete cascade,
  tenant_id text not null references public.tenants (id),
  email text,
  name text,
  telegram_id text unique, -- == ownerChatId on the ESP32
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.devices (
  device_id text primary key, -- ESP32 MAC, or legacy-<chatId> for firmware v1
  tenant_id text not null references public.tenants (id),
  owner_telegram_id text,
  customer_id uuid references public.customers (id) on delete set null,
  address text,
  area text,
  target_kg double precision,
  last_weight_kg double precision,
  last_seen_at timestamptz,
  firmware_version text,
  wifi_rssi integer,
  api_key_hash text, -- sha256 of the device key; never exposed to clients
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index devices_customer_idx on public.devices (customer_id);
create index devices_owner_telegram_idx on public.devices (owner_telegram_id);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id),
  name text not null,
  telegram_chat_id text not null unique,
  status text not null default 'OFFLINE' check (status in ('AVAILABLE', 'ON_JOB', 'OFFLINE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id text primary key, -- '<deviceId>#<deviceOrderId>': order numbers repeat across baskets
  device_order_id integer not null,
  device_id text not null references public.devices (device_id),
  tenant_id text not null references public.tenants (id),
  customer_telegram_id text,
  customer_id uuid references public.customers (id) on delete set null,
  driver_id text, -- driver's Telegram chat ID
  address text not null default '',
  weight_kg double precision not null check (weight_kg >= 0),
  status text not null check (status in ('PENDING', 'ACCEPTED', 'COMPLETED', 'CANCELLED')),
  payment_status text not null default 'UNPAID' check (payment_status in ('UNPAID', 'PENDING', 'PAID', 'REFUNDED')),
  amount_due double precision not null check (amount_due >= 0),
  placed_at timestamptz not null,
  accepted_at timestamptz,
  completed_at timestamptz,
  stripe_session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_customer_idx on public.orders (customer_id, placed_at desc);
create index orders_tenant_idx on public.orders (tenant_id, placed_at desc);
create index orders_telegram_idx on public.orders (customer_telegram_id, placed_at desc);
create index orders_active_idx on public.orders (tenant_id, placed_at desc) where status in ('PENDING', 'ACCEPTED');

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id text not null references public.orders (id) on delete cascade,
  device_id text not null,
  type text not null,
  at timestamptz not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, at);

-- updated_at is maintained by the database (the ingest API relies on it for optimistic concurrency).
create trigger tenants_updated before update on public.tenants for each row execute function public.set_updated_at();
create trigger customers_updated before update on public.customers for each row execute function public.set_updated_at();
create trigger devices_updated before update on public.devices for each row execute function public.set_updated_at();
create trigger drivers_updated before update on public.drivers for each row execute function public.set_updated_at();
create trigger orders_updated before update on public.orders for each row execute function public.set_updated_at();

-- ---------- row level security ----------
alter table public.tenants enable row level security;
alter table public.customers enable row level security;
alter table public.devices enable row level security;
alter table public.drivers enable row level security;
alter table public.orders enable row level security;
alter table public.order_events enable row level security;

create policy "tenants: signed-in users read" on public.tenants for select to authenticated using (true);
create policy "tenants: managers write" on public.tenants for all to authenticated using (public.is_manager()) with check (public.is_manager());

create policy "customers: read own or manager" on public.customers for select to authenticated
  using (id = auth.uid() or public.is_manager());
create policy "customers: managers write" on public.customers for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy "devices: read own or manager" on public.devices for select to authenticated
  using (customer_id = auth.uid() or public.is_manager());
create policy "devices: managers write" on public.devices for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy "drivers: managers only" on public.drivers for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy "orders: read own or manager" on public.orders for select to authenticated
  using (customer_id = auth.uid() or public.is_manager());
create policy "orders: managers write" on public.orders for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy "order_events: managers read" on public.order_events for select to authenticated
  using (public.is_manager());

-- Hide device key hashes from every client role (column-level privilege on top of RLS).
revoke select on public.devices from anon, authenticated;
grant select (
  device_id, tenant_id, owner_telegram_id, customer_id, address, area, target_kg, last_weight_kg,
  last_seen_at, firmware_version, wifi_rssi, created_at, updated_at
) on public.devices to authenticated;

-- ---------- seed ----------
insert into public.tenants (id, name, price_per_kg, currency)
values ('tenant-delhi-01', 'Toss Delhi', 80, 'INR')
on conflict (id) do nothing;
