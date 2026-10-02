-- "Get a Toss basket" requests from the website. The owner is emailed each one; the row is the record if
-- email fails. Only the server (service role) reads or writes it.
create table if not exists public.basket_requests (
  id bigserial primary key,
  name text not null check (char_length(name) between 2 and 80),
  phone text,
  email text,
  city text,
  colour text not null,
  quantity integer not null default 1 check (quantity between 1 and 50),
  message text,
  status text not null default 'NEW' check (status in ('NEW', 'CONTACTED', 'DONE')),
  created_at timestamptz not null default now(),
  check (phone is not null or email is not null)
);
alter table public.basket_requests enable row level security; -- no policies: clients get nothing
revoke all on public.basket_requests from anon, authenticated;
