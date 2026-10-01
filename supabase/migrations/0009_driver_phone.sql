-- Managers add drivers by name and mobile number. The driver's Telegram attaches itself when they
-- open the driver bot and tap "Share my phone number": the bot matches the shared (Telegram-verified)
-- contact to this column and fills in telegram_chat_id. Until then the driver can't get pickups.

alter table public.drivers
  add column phone text unique check (phone ~ '^\+[1-9][0-9]{7,14}$'), -- E.164, e.g. +919876543210
  alter column telegram_chat_id drop not null;

grant select (phone) on public.drivers to authenticated;
