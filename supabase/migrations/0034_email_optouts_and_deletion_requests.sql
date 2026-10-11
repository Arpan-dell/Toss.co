-- Unsubscribes from optional emails, and requests to delete personal data. Both are written and read only by the
-- server (service role); RLS is on with no policies, so the public API can't touch them.

create table if not exists public.email_optouts (
  email text primary key check (email = lower(email)),
  categories text[] not null default '{}', -- "reminders", "alerts", or "all"
  updated_at timestamptz not null default now()
);
alter table public.email_optouts enable row level security;
revoke all on public.email_optouts from anon, authenticated;

create table if not exists public.deletion_requests (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  name text,
  role text, -- CUSTOMER / MANAGER / none (not signed in)
  details text,
  status text not null default 'OPEN' check (status in ('OPEN', 'DONE', 'REJECTED')),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  note text -- what was done, for the owner's records
);
create index if not exists deletion_requests_open_idx on public.deletion_requests (created_at) where status = 'OPEN';
alter table public.deletion_requests enable row level security;
revoke all on public.deletion_requests from anon, authenticated;
