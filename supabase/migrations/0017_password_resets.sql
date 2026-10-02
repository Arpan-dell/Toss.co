-- Password reset. Tokens are 32 random bytes sent once by email; only their SHA-256 hash is stored. Each is
-- tied to one user, expires 15 minutes after it's issued, and is consumed atomically (single use); consuming one
-- also voids that user's other open reset links. Nothing here is reachable by clients: the server calls it
-- with the service role.
create table if not exists public.password_resets (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists password_resets_user on public.password_resets (user_id);
alter table public.password_resets enable row level security; -- no policies: clients get nothing
revoke all on public.password_resets from anon, authenticated;

-- Account lookup for the reset email (never exposed: the reply is the same whether or not it exists).
create or replace function public.auth_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;

-- Uses a token: returns its user if it's unused and unexpired, otherwise null. Single use.
create or replace function public.consume_password_reset(p_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  update public.password_resets set used_at = now()
    where token_hash = p_hash and used_at is null and expires_at > now()
    returning user_id into uid;
  if uid is not null then
    update public.password_resets set used_at = now() where user_id = uid and used_at is null;
  end if;
  return uid;
end;
$$;

-- Signs a user out everywhere: deleting their sessions also deletes the refresh tokens (cascade), so no device
-- can get a new access token. Used after a password reset.
create or replace function public.revoke_user_sessions(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions where user_id = p_user;
$$;

revoke all on function public.auth_user_id_by_email(text) from public, anon, authenticated;
revoke all on function public.consume_password_reset(text) from public, anon, authenticated;
revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
