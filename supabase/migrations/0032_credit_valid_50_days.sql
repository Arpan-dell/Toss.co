-- Basket credit now lasts 50 days from when it is granted (was 180). The owner can still change it on
-- /owner/credits ("Credit valid for (days)"). Wallets already granted keep the expiry they were given.
alter table public.platform_settings alter column credit_valid_days set default 50;
update public.platform_settings set credit_valid_days = 50 where id = 1;
