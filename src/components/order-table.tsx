import { OrderLink } from "@/components/order-link";
import type { Order } from "@/lib/types";
import { formatDateTime, formatINR, formatKg, orderLabel } from "@/lib/format";
import { now } from "@/lib/data";
import { isLate } from "@/lib/turnaround";
import { EmptyState, OrderStatusBadge, PaymentBadge } from "./ui";

export const invoiceHref = (orderId: string) => `/invoice/${encodeURIComponent(orderId)}`;

// linkToAdmin: each order opens its detail page in the manager portal.
export function OrderTable({ orders, showAddress = false, emptyText = "No orders yet.", linkToAdmin = false }: {
  orders: Order[];
  showAddress?: boolean;
  emptyText?: string;
  linkToAdmin?: boolean;
}) {
  if (orders.length === 0) return <EmptyState>{emptyText}</EmptyState>;
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] tracking-[0.12em] text-muted uppercase">
            <th className="px-5 py-2 font-medium">Order</th>
            <th className="px-3 py-2 font-medium">Placed</th>
            {showAddress && <th className="px-3 py-2 font-medium">Address</th>}
            <th className="px-3 py-2 text-right font-medium">Weight</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-5 py-2 font-medium">Payment</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} data-reveal="row" className="border-b border-border transition-colors last:border-0 hover:bg-ink/[0.03]">
              <td className="px-5 py-2.5 font-mono text-xs">
                {linkToAdmin ? (
                  <OrderLink order={o} />
                ) : (
                  orderLabel(o)
                )}
              </td>
              <td className="px-3 py-2.5 text-secondary">{formatDateTime(o.createdAt)}</td>
              {showAddress && <td className="max-w-[220px] truncate px-3 py-2.5 text-secondary">{o.address}</td>}
              <td className="px-3 py-2.5 text-right tabular-nums">{formatKg(o.weightKg)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {formatINR(o.amountDue)}
                {o.discountPct ? <span className="ml-1.5 rounded-full bg-good-bg px-1.5 py-0.5 text-[10px] text-good">−{o.discountPct}%</span> : null}
              </td>
              <td className="px-3 py-2.5">
                <OrderStatusBadge status={o.status} />
                {linkToAdmin && isLate(o, now()) && <span className="ml-1.5 rounded-[4px] bg-critical-bg px-1.5 py-0.5 text-[10px] font-medium text-critical">Late</span>}
              </td>
              <td className="px-5 py-2.5">
                <span className="flex items-center gap-2">
                  <PaymentBadge status={o.paymentStatus} />
                  {o.paymentStatus === "PAID" && (
                    // Plain link: the route returns a PDF.
                    <a href={invoiceHref(o.id)} target="_blank" rel="noreferrer" className="text-xs text-accent hover:text-accent-2">
                      Invoice
                    </a>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
