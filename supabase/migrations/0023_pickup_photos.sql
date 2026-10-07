-- Photo proof at pickup. After a driver marks a pickup done, the driver bot asks for one photo of the bag
-- (optional). drivers.photo_order_id remembers which pickup the next photo belongs to; the photo itself stays on
-- Telegram's servers and is fetched through the app (the bot token never reaches the browser).
alter table public.drivers add column photo_order_id text references public.orders (id) on delete set null;
alter table public.orders
  add column pickup_photo_file_id text,
  add column pickup_photo_at timestamptz;
