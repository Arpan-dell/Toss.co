-- Fixed-window rate limiting shared by every server instance. Keys are "bucket:sha256(identifier)" (an IP or
-- email is never stored in clear). Only the service role can touch it; the app calls rate_limit_hit() from
-- server code before sign-in, sign-up, password changes and the directory's geocoding.
create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);
alter table public.rate_limits enable row level security; -- no policies: clients get nothing
revoke all on public.rate_limits from anon, authenticated;

-- Counts one attempt and returns true while the caller is within p_limit attempts per p_window_seconds.
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.rate_limits as rl (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when rl.window_start <= now() - make_interval(secs => p_window_seconds) then 1 else rl.hits + 1 end,
    window_start = case when rl.window_start <= now() - make_interval(secs => p_window_seconds) then now() else rl.window_start end
  returning hits into n;
  return n <= p_limit;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
