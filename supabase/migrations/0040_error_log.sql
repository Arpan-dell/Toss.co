-- 0040: error tracking, in our own database (run after 0039).
-- Every error the app logs is also kept here for 30 days, already stripped of personal data (see src/lib/log.ts), so the
-- owner can see what is failing without opening Vercel's logs. Server-only: no one can read it through the API.

create table if not exists public.error_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source text not null default 'server' check (source in ('server', 'browser')),
  context text not null,          -- a fixed description, like "invoice email failed"
  detail text,                    -- error type, code and redacted message
  ref text                        -- the short reference also printed in the logs and shown on the error screen
);
create index if not exists error_log_created_idx on public.error_log (created_at desc);
alter table public.error_log enable row level security;
revoke all on public.error_log from anon, authenticated;
