-- Win-back offers (automatic discounts for customers who stopped ordering) are a Toss Pro tool: only laundries on
-- Pro (in their trial or paid up) create them. Same function as 0010 plus the plan check.
create or replace function public.create_winback_offers()
returns table (offer_id bigint, telegram_id text, business text, percent integer, expires_at timestamptz)
language sql security definer set search_path = ''
as $$
  with last as (
    select o.customer_id, o.tenant_id, max(o.placed_at) as last_at
    from public.orders o
    where o.customer_id is not null and o.tenant_id is not null and o.status <> 'CANCELLED'
    group by o.customer_id, o.tenant_id
  ), due as (
    select l.customer_id, l.tenant_id, t.winback_pct
    from last l
    join public.tenants t on t.id = l.tenant_id and t.winback_enabled and t.plan_status <> 'SUSPENDED'
      and (t.paid_until > now() or t.trial_ends_at > now())
    join public.customers c on c.id = l.customer_id and c.tenant_id = l.tenant_id
    where l.last_at < now() - make_interval(days => t.winback_days)
      and not exists (
        select 1 from public.customer_offers f
        where f.customer_id = l.customer_id and f.tenant_id = l.tenant_id and f.created_at > l.last_at
      )
  ), ins as (
    insert into public.customer_offers (tenant_id, customer_id, percent, expires_at)
    select d.tenant_id, d.customer_id, d.winback_pct, now() + interval '14 days' from due d
    returning id, customer_id, tenant_id, percent, expires_at
  )
  select ins.id, c.telegram_id, t.name, ins.percent, ins.expires_at
  from ins
  join public.customers c on c.id = ins.customer_id
  join public.tenants t on t.id = ins.tenant_id;
$$;
