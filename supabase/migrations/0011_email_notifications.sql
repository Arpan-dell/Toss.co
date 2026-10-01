-- Email notifications: remember which renewal reminder a business last got (so the daily job sends
-- each one once), and let a manager ask Toss to close their business.
-- Both are written only by the server (service role); managers can read them on their own business.

alter table public.tenants
  add column reminder_key text,                 -- e.g. 'ACTIVE:2026-11-01:3' = the 3-day reminder for that end date
  add column closure_requested_at timestamptz,  -- manager asked to remove the business
  add column closure_reason text check (char_length(closure_reason) <= 500);
