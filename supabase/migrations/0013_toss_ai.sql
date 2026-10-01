-- Toss AI: daily business analysis + an action queue the manager approves, or the autopilot runs.
-- The AI only ever sees aggregates and customer codes; every action it proposes is re-checked
-- against the manager's guardrails on the server before anything happens.

-- ---------- autopilot settings (per business) ----------
alter table public.tenants
  add column autopilot_enabled boolean not null default false,  -- "Automate everything" master switch
  add column autopilot_staffing boolean not null default true,  -- driver alerts + max pickups
  add column autopilot_winback boolean not null default true,   -- personalised win-back offers
  add column autopilot_nudges boolean not null default true,    -- payment reminders, basket nudges
  add column autopilot_pricing boolean not null default false,  -- price per kg changes
  add column ai_max_discount int not null default 20 check (ai_max_discount between 1 and 50),
  add column ai_price_min double precision check (ai_price_min > 0),
  add column ai_price_max double precision check (ai_price_max > 0),
  add column ai_price_step_pct int not null default 5 check (ai_price_step_pct between 1 and 20);
grant update (autopilot_enabled, autopilot_staffing, autopilot_winback, autopilot_nudges, autopilot_pricing,
              ai_max_discount, ai_price_min, ai_price_max, ai_price_step_pct) on public.tenants to authenticated;

-- ---------- analysis runs ----------
create table public.ai_runs (
  id bigint generated always as identity primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  trigger text not null check (trigger in ('daily', 'manual', 'ask')),
  source text not null check (source in ('ai', 'rules')),  -- 'rules' when the AI was unavailable
  model text,
  report jsonb not null,     -- briefing, KPIs, forecast, risks, opportunities (or the Q&A)
  error text,
  created_at timestamptz not null default now()
);
create index ai_runs_tenant_idx on public.ai_runs (tenant_id, created_at desc);

-- ---------- action queue / audit log ----------
create table public.ai_actions (
  id bigint generated always as identity primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  run_id bigint references public.ai_runs (id) on delete set null,
  type text not null check (type in ('driver_alert', 'set_max_jobs', 'winback_offer', 'payment_reminder', 'basket_nudge', 'price_change')),
  target text not null,       -- what it acts on: a date, driver id, customer id, order id, device id, or the business
  label text not null,        -- human summary shown to the manager
  params jsonb not null default '{}',
  reason text not null default '',
  impact text not null default '',
  priority int not null default 2 check (priority between 1 and 3),
  status text not null default 'SUGGESTED' check (status in ('SUGGESTED', 'EXECUTED', 'DISMISSED', 'FAILED', 'EXPIRED')),
  auto boolean not null default false,  -- executed by the autopilot rather than a click
  result text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index ai_actions_tenant_idx on public.ai_actions (tenant_id, created_at desc);
create index ai_actions_queue_idx on public.ai_actions (tenant_id, status);
create index ai_actions_run_idx on public.ai_actions (run_id);
create index ai_actions_recent_idx on public.ai_actions (tenant_id, type, target, decided_at desc);

alter table public.ai_runs enable row level security;
alter table public.ai_actions enable row level security;
create policy "ai_runs: read" on public.ai_runs for select to authenticated using (
  tenant_id = (select public.auth_tenant()) or (select public.is_owner())
);
create policy "ai_actions: read" on public.ai_actions for select to authenticated using (
  tenant_id = (select public.auth_tenant()) or (select public.is_owner())
);
-- Written only by the server (service role), after checking the caller is that business's manager.
revoke insert, update, delete on public.ai_runs, public.ai_actions from anon, authenticated;
