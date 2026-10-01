-- Invoices for paid pickups: a unique, sequential invoice number per paid order (TOSS-2026-000001),
-- and when the invoice was sent to the customer (so it's emailed once).

create sequence public.invoice_seq;

alter table public.orders
  add column invoice_number text unique,
  add column invoice_issued_at timestamptz,
  add column invoice_sent_at timestamptz;

-- Server-only: gives a paid order its invoice number (once) and returns it; null if not paid.
create or replace function public.issue_invoice(p_order text)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  o record;
  num text;
begin
  select id, payment_status, invoice_number into o from public.orders where id = p_order for update;
  if o.id is null or o.payment_status <> 'PAID' then return null; end if;
  if o.invoice_number is not null then return o.invoice_number; end if;
  num := 'TOSS-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY') || '-' || lpad(nextval('public.invoice_seq')::text, 6, '0');
  update public.orders set invoice_number = num, invoice_issued_at = now() where id = p_order;
  return num;
end;
$$;

revoke execute on function public.issue_invoice(text) from public, anon, authenticated;
revoke all on sequence public.invoice_seq from public, anon, authenticated;
