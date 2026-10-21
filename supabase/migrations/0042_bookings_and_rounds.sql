-- 0042: pickups without a basket, and collection rounds for hostels and PGs (run after 0041).
--
-- 1. Bookings. A customer without a Toss basket books a pickup from the website (or the laundry books one for a
--    customer who phoned). Each such customer gets a "virtual basket": a devices row whose id starts "web-" (booked
--    by the customer) or "tel-" (booked by the laundry for a phone number), so every order still has a basket and
--    the whole pipeline (dispatch, weighing at the door, payment, delivery) works unchanged. A booking can be for
--    as soon as possible or for a time slot (pickup_after); it is given to a driver when the slot comes up.
-- 2. Collection rounds. A hostel or PG (a business account) can have a round every few days at a set time. Its
--    residents tap "I have clothes this time" before the round; when it's due, one driver gets every bag of that
--    round as one stop. The account decides who pays: the hostel (one monthly bill) or each resident.

-- ---------- orders: where a pickup came from, when, and who to call ----------
alter table public.orders add column if not exists source text not null default 'basket'
  check (source in ('basket', 'web', 'manager', 'round'));
alter table public.orders add column if not exists pickup_after timestamptz;      -- not before this time (a slot or a round)
alter table public.orders add column if not exists notes text check (notes is null or char_length(notes) <= 300);
alter table public.orders add column if not exists bags smallint check (bags is null or bags between 1 and 20);
alter table public.orders add column if not exists contact_name text check (contact_name is null or char_length(contact_name) <= 80);
alter table public.orders add column if not exists contact_phone text check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{7,14}$');
create index if not exists orders_due_idx on public.orders (pickup_after) where status = 'PENDING' and pickup_after is not null;
-- the hostel/PG round a pickup belongs to (also when each resident pays, so account_id stays empty)
alter table public.orders add column if not exists round_account_id text references public.business_accounts (id) on delete set null;

-- ---------- hostels and PGs: address, rounds and who pays ----------
alter table public.business_accounts add column if not exists address text check (address is null or char_length(address) <= 300);
alter table public.business_accounts add column if not exists round_every_days smallint check (round_every_days is null or round_every_days between 1 and 14);
alter table public.business_accounts add column if not exists round_time text check (round_time is null or round_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table public.business_accounts add column if not exists round_next_at timestamptz;
alter table public.business_accounts add column if not exists round_cutoff_minutes smallint not null default 60 check (round_cutoff_minutes between 0 and 1440);
alter table public.business_accounts add column if not exists billing text not null default 'account' check (billing in ('account', 'resident'));

-- ---------- residents: which hostel or PG a customer lives in ----------
-- Written and read by the server only (after checking who's asking), so no new column grants are given.
alter table public.customers add column if not exists account_id text references public.business_accounts (id) on delete set null;
alter table public.customers add column if not exists room text check (room is null or char_length(room) <= 20);
create index if not exists customers_account_idx on public.customers (account_id) where account_id is not null;
