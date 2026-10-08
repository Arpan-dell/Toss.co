-- Drivers confirm what they're sent, and messages about a job that moved to another driver are taken back.
--
-- driver_ack_at / delivery_ack_at: the driver tapped "Got it" on the pickup / delivery (or acted on it), so the
-- manager can see it reached them. Cleared whenever the job goes to someone else.
-- driver_messages: the Telegram messages the bot sent a driver about a job, so they can be deleted when the job is
-- moved, removed or cancelled (Telegram lets a bot delete its own messages for 48 hours). Server-only.

alter table public.orders
  add column driver_ack_at timestamptz,
  add column delivery_ack_at timestamptz;

create table public.driver_messages (
  id bigint generated always as identity primary key,
  order_id text not null references public.orders (id) on delete cascade,
  kind text not null check (kind in ('pickup', 'delivery')),
  chat_id text not null,
  message_id bigint not null,
  created_at timestamptz not null default now()
);
create index driver_messages_order_idx on public.driver_messages (order_id, kind);

alter table public.driver_messages enable row level security; -- no policies: only the server (service role) uses it
revoke all on public.driver_messages from anon, authenticated;
