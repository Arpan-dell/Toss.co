-- How each driver is paid: per trip (the laundry's rate per pickup or delivery, plus per km) or a fixed monthly
-- salary. drivers has column-level grants (bot state stays hidden), so the new columns get their own: managers read
-- and change them for their own drivers (RLS limits rows to their business).
alter table public.drivers
  add column pay_type text not null default 'TRIP' check (pay_type in ('TRIP', 'SALARY')),
  add column monthly_salary double precision not null default 0 check (monthly_salary between 0 and 1000000);
grant select (pay_type, monthly_salary) on public.drivers to authenticated;
grant update (pay_type, monthly_salary) on public.drivers to authenticated;
