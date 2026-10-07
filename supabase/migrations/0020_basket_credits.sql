-- Basket credits. A Toss basket is sold for ₹800 with ₹500 of laundry credit for its customer. The credit comes
-- off completed pickups a little at a time (₹8 per kg, at most 30% of any bill) until it runs out or expires.
-- The laundry and Toss share the cost: the laundry gets less on that bill, and Toss gives its share back as a
-- discount on the laundry's next subscription payment (up to half of that payment).
--
-- The credit is applied in one place, a trigger on orders, so every path that prices an order (the basket, the
-- driver's weigh-in, a manager's correction) stays consistent: orders.amount_gross is the price before credit,
-- orders.credit_applied the credit, and amount_due what the customer pays. It is worked out while the order is
-- completed and unpaid, and frozen once a payment is reported.

-- ---------- settings (owner) ----------
alter table public.platform_settings
  add column basket_price int not null default 800 check (basket_price between 0 and 100000),
  add column basket_credit int not null default 500 check (basket_credit between 0 and 100000),
  add column credit_per_kg double precision not null default 8 check (credit_per_kg between 0 and 1000),
  add column credit_max_pct int not null default 30 check (credit_max_pct between 0 and 100),
  add column credit_toss_share_pct int not null default 50 check (credit_toss_share_pct between 0 and 100),
  add column credit_sub_max_pct int not null default 50 check (credit_sub_max_pct between 0 and 100),
  add column credit_valid_days int not null default 180 check (credit_valid_days between 1 and 3650);

-- ---------- the customer's wallet, and every grant behind it ----------
create table public.customer_credits (
  customer_id uuid primary key references public.customers (id) on delete cascade,
  granted double precision not null default 0 check (granted >= 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create table public.credit_grants (
  id bigint generated always as identity primary key,
  customer_id uuid not null references public.customers (id) on delete cascade,
  device_id text,
  amount double precision not null check (amount > 0),
  note text,
  granted_by uuid,
  granted_at timestamptz not null default now()
);
create index credit_grants_customer_idx on public.credit_grants (customer_id);

alter table public.customer_credits enable row level security;
alter table public.credit_grants enable row level security;
create policy "customer_credits: read" on public.customer_credits for select to authenticated using (
  customer_id = (select auth.uid()) or (select public.is_owner())
);
create policy "credit_grants: read" on public.credit_grants for select to authenticated using (
  customer_id = (select auth.uid()) or (select public.is_owner())
);
revoke insert, update, delete on public.customer_credits, public.credit_grants from anon, authenticated;

-- ---------- orders: price before credit, and the credit taken ----------
alter table public.orders
  add column amount_gross double precision,
  add column credit_applied double precision not null default 0 check (credit_applied >= 0);
update public.orders set amount_gross = amount_due where amount_gross is null;
create index orders_customer_credit_idx on public.orders (customer_id) where credit_applied > 0;

create or replace function public.orders_apply_credit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  s record;
  w record;
  gross double precision;
  used double precision;
  cap double precision;
begin
  -- A fresh amount_due written by the code is the price before credit; otherwise keep the stored one.
  if tg_op = 'INSERT' or new.amount_due is distinct from old.amount_due then
    gross := new.amount_due;
  else
    gross := coalesce(old.amount_gross, old.amount_due);
  end if;
  new.amount_gross := gross;

  -- Once a payment is reported (or made), the credit on this order is settled: leave it as it is.
  if tg_op = 'UPDATE' and old.payment_status <> 'UNPAID' then
    new.credit_applied := old.credit_applied;
    if new.amount_due is not distinct from old.amount_due then new.amount_due := gross - old.credit_applied; end if;
    return new;
  end if;

  new.credit_applied := 0;
  -- (on the update that reports a payment, old is still UNPAID: work it out once more and it freezes from then on)
  if new.status = 'COMPLETED' and (tg_op = 'UPDATE' or new.payment_status = 'UNPAID') and new.customer_id is not null and coalesce(gross, 0) > 0 then
    select * into w from public.customer_credits where customer_id = new.customer_id and expires_at > now();
    if w.customer_id is not null then
      select * into s from public.platform_settings where id = 1;
      select coalesce(sum(credit_applied), 0) into used from public.orders
        where customer_id = new.customer_id and id <> new.id and status <> 'CANCELLED';
      cap := least(
        greatest(w.granted - used, 0),
        coalesce(new.weight_kg, 0) * s.credit_per_kg,
        gross * s.credit_max_pct / 100.0
      );
      new.credit_applied := greatest(floor(cap), 0); -- whole rupees
    end if;
  end if;
  new.amount_due := gross - new.credit_applied;
  return new;
end;
$$;
revoke execute on function public.orders_apply_credit() from public, anon, authenticated;

create trigger orders_apply_credit before insert or update on public.orders
  for each row execute function public.orders_apply_credit();

-- ---------- owner: grant a basket's credit to a customer ----------
create or replace function public.grant_basket_credit(p_customer_code text, p_device_id text, p_amount double precision, p_note text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  c record;
  days int;
  amt double precision;
begin
  if not public.is_owner() then raise exception 'only_owner' using errcode = 'P0001'; end if;
  select id, name into c from public.customers where customer_code = upper(trim(p_customer_code));
  if c.id is null then raise exception 'customer_not_found' using errcode = 'P0002'; end if;
  select credit_valid_days, basket_credit into days, amt from public.platform_settings where id = 1;
  amt := coalesce(p_amount, amt);
  if amt <= 0 or amt > 100000 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;

  insert into public.credit_grants (customer_id, device_id, amount, note, granted_by)
  values (c.id, nullif(trim(p_device_id), ''), amt, nullif(trim(p_note), ''), auth.uid());
  -- one wallet per customer: a new grant adds to it and restarts the validity
  insert into public.customer_credits (customer_id, granted, expires_at)
  values (c.id, amt, now() + make_interval(days => days))
  on conflict (customer_id) do update
    set granted = public.customer_credits.granted + excluded.granted,
        expires_at = greatest(public.customer_credits.expires_at, excluded.expires_at),
        updated_at = now();
  return jsonb_build_object('customer', c.name, 'amount', amt);
end;
$$;
revoke execute on function public.grant_basket_credit(text, text, double precision, text) from public, anon;
grant execute on function public.grant_basket_credit(text, text, double precision, text) to authenticated;

-- ---------- Toss's share back to the laundry, as subscription credit ----------
alter table public.subscription_payments
  add column credit_used double precision not null default 0 check (credit_used >= 0);

-- Earned: Toss's share of the credit on this laundry's paid orders. Spent: what earlier subscription payments used.
create or replace function public.tenant_credit_balance(p_tenant text)
returns double precision language sql stable security definer set search_path = ''
as $$
  select greatest(
    coalesce((select sum(o.credit_applied) from public.orders o where o.tenant_id = p_tenant and o.payment_status = 'PAID'), 0)
      * (select credit_toss_share_pct from public.platform_settings where id = 1) / 100.0
    - coalesce((select sum(p.credit_used) from public.subscription_payments p where p.tenant_id = p_tenant and p.status in ('PENDING', 'APPROVED')), 0),
    0)
  where public.is_owner() or public.auth_tenant() = p_tenant;
$$;
revoke execute on function public.tenant_credit_balance(text) from public, anon;
grant execute on function public.tenant_credit_balance(text) to authenticated;

-- Same as before, plus the basket-credit discount (mirrored in src/lib/pricing.ts).
create or replace function public.submit_subscription_payment(p_months int, p_ref text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  ref text := upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'));
  price double precision;
  pct int;
  maxpct int;
  base double precision;
  credit double precision;
begin
  if public.auth_role() <> 'manager' or public.auth_tenant() is null then
    raise exception 'only_managers' using errcode = 'P0001';
  end if;
  if ref !~ '^[A-Z0-9]{6,35}$' then raise exception 'invalid_reference' using errcode = 'P0001'; end if;
  if p_months not between 1 and 12 then raise exception 'invalid_months' using errcode = 'P0001'; end if;
  select monthly_price, credit_sub_max_pct into price, maxpct from public.platform_settings where id = 1;
  pct := public.subscription_discount(p_months);
  base := round((price * p_months * (100 - pct) / 100)::numeric);
  -- coalesce: least() skips nulls, so an unreadable balance must count as zero, not as "no limit"
  credit := least(floor(coalesce(public.tenant_credit_balance(public.auth_tenant()), 0)), floor(base * maxpct / 100.0));
  insert into public.subscription_payments (tenant_id, months, amount, discount_pct, credit_used, payment_ref)
  values (public.auth_tenant(), p_months, base - credit, pct, credit, ref);
end;
$$;
