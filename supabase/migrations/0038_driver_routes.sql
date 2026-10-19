-- 0038: drivers' routes (run after 0037).
--  - A driver can carry up to 20 jobs at once (was 9); new drivers start at 5.
--  - Where a driver was when given each pickup or delivery, so the distance they cover is counted from their real
--    starting point, stop to stop (not every turn they made in between).

alter table public.drivers drop constraint if exists drivers_max_jobs_check;
alter table public.drivers add constraint drivers_max_jobs_check check (max_jobs between 1 and 20);
alter table public.drivers alter column max_jobs set default 5;

alter table public.orders
  add column if not exists pickup_start_lat double precision,
  add column if not exists pickup_start_lng double precision,
  add column if not exists delivery_start_lat double precision,
  add column if not exists delivery_start_lng double precision;

-- Keeping an online driver's location up to date: when their Telegram live location runs out ("until I turn it
-- off" is stored as 2100), and when the bot last reminded them to turn it back on. Server-only (service role).
alter table public.drivers
  add column if not exists live_until timestamptz,
  add column if not exists location_nudged_at timestamptz;
