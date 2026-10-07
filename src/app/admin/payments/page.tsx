import type { Metadata } from "next";
import { planGate } from "@/components/plan-gate";
import { Badge, Card, EmptyState, PageTitle, StatTile } from "@/components/ui";
import { confirmPayment, markPaidCash, rejectPayment } from "@/lib/actions/manager";
import { listCustomers, listOrders, now } from "@/lib/data";
import { formatDateTime, formatINR, formatKg, orderLabel, timeAgo } from "@/lib/format";
import type { Customer, Order } from "@/lib/types";
import { AmountForm } from "./amount-form";
import { OptimisticForm, OptimisticRow } from "@/components/optimistic";

export const metadata: Metadata = { title: "Payments" };

function who(o: Order, customers: Map<string, Customer>) {
  const c = o.customerId ? customers.get(o.customerId) : undefined;
  return c ? `${c.name ?? c.email ?? "Customer"} · ${c.customerCode}` : "Customer not linked yet";
}

export default async function Payments() {
  const locked = await planGate();
  if (locked) return locked;

  const [orders, customerList] = await Promise.all([listOrders(), listCustomers()]);
  const customers = new Map(customerList.map((c) => [c.id, c]));
  const current = now();

  const toVerify = orders.filter((o) => o.paymentStatus === "PENDING");
  // business accounts pay monthly from their own page, not pickup by pickup
  const unpaid = orders.filter((o) => o.paymentStatus === "UNPAID" && o.status === "COMPLETED" && !o.accountId);
  const onAccounts = orders.filter((o) => o.paymentStatus === "UNPAID" && o.status === "COMPLETED" && o.accountId).reduce((s, o) => s + o.amountDue, 0);
  const paid = orders.filter((o) => o.paymentStatus === "PAID").slice(0, 20);
  const outstanding = unpaid.reduce((s, o) => s + o.amountDue, 0);
  const collected = orders.filter((o) => o.paymentStatus === "PAID").reduce((s, o) => s + o.amountDue, 0);

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker="Money in">Payments</PageTitle>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatTile label="To verify" value={String(toVerify.length)} hint="Customer says they paid" />
        <StatTile label="Outstanding" value={formatINR(outstanding)} hint={`${unpaid.length} unpaid pickups${onAccounts ? ` + ${formatINR(onAccounts)} on monthly accounts` : ""}`} />
        <StatTile label="Collected" value={formatINR(collected)} hint="All confirmed payments" />
      </div>

      <Card title="Check these in your UPI app" action={toVerify.length > 0 ? <Badge tone="warn" live>{toVerify.length} waiting</Badge> : undefined}>
        {toVerify.length === 0 ? (
          <EmptyState>No payments waiting for confirmation.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {toVerify.map((o) => (
              <OptimisticRow key={o.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-[220px] flex-1 text-sm">
                  <p className="font-medium">
                    {formatINR(o.amountDue)} <span className="font-mono text-xs text-muted">{orderLabel(o)}</span>
                  </p>
                  <p className="text-secondary">{who(o, customers)}</p>
                  <p className="text-xs text-muted">
                    {o.paymentMethod === "CASH" ? (
                      <span className="text-fg">Cash collected by the driver at delivery</span>
                    ) : (
                      <>
                        UPI ref <span className="font-mono text-fg">{o.paymentRef}</span>
                      </>
                    )}
                    {o.paymentReportedAt ? ` · reported ${timeAgo(o.paymentReportedAt, current)}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <OptimisticForm action={confirmPayment} hide>
                    <input type="hidden" name="orderId" value={o.id} />
                    <button className="btn-primary rounded-full px-4 py-1.5 text-sm font-medium">Received</button>
                  </OptimisticForm>
                  <OptimisticForm action={rejectPayment} hide>
                    <input type="hidden" name="orderId" value={o.id} />
                    <button className="btn-ghost rounded-full px-4 py-1.5 text-sm text-critical">Not received</button>
                  </OptimisticForm>
                </div>
              </OptimisticRow>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-muted">
          Match the UPI reference with the credit in your bank or UPI app before confirming. &quot;Not received&quot; puts
          the invoice back to unpaid so the customer can try again.
        </p>
      </Card>

      <Card title="Unpaid pickups">
        {unpaid.length === 0 ? (
          <EmptyState>Nothing outstanding.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {unpaid.map((o) => (
              <OptimisticRow key={o.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-[220px] flex-1 text-sm">
                  <p className="font-medium">
                    {formatINR(o.amountDue)} <span className="font-mono text-xs text-muted">{orderLabel(o)}</span>
                  </p>
                  <p className="text-secondary">{who(o, customers)}</p>
                  <p className="text-xs text-muted">
                    {formatKg(o.weightKg)} · picked up {o.completedAt ? formatDateTime(o.completedAt) : "—"}
                  </p>
                </div>
                <AmountForm orderId={o.id} amount={o.amountDue} />
                <OptimisticForm action={markPaidCash} hide>
                  <input type="hidden" name="orderId" value={o.id} />
                  <button className="btn-ghost rounded-full px-4 py-1.5 text-sm">Mark paid (cash)</button>
                </OptimisticForm>
              </OptimisticRow>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Recently paid">
        {paid.length === 0 ? (
          <EmptyState>No confirmed payments yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {paid.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span>
                  {formatINR(o.amountDue)} <span className="font-mono text-xs text-muted">{orderLabel(o)}</span>
                  <span className="ml-2 text-secondary">{who(o, customers)}</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {o.paymentMethod ?? "—"}
                  {o.paymentRef ? ` · ${o.paymentRef}` : ""}
                  <Badge tone="good" icon="✓">Paid</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
