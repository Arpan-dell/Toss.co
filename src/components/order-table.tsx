import type { Order } from "@/lib/types";
import { formatDateTime, formatINR, formatKg, orderLabel } from "@/lib/format";
import { EmptyState, OrderStatusBadge, PaymentBadge } from "./ui";

export function OrderTable({ orders, showAddress = false, emptyText = "No orders yet." }: {
  orders: Order[];
  showAddress?: boolean;
  emptyText?: string;
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
            <tr key={o.id} data-reveal="row" className="border-b border-border transition-colors last:border-0 hover:bg-white/[0.03]">
              <td className="px-5 py-2.5 font-mono text-xs">{orderLabel(o)}</td>
              <td className="px-3 py-2.5 text-secondary">{formatDateTime(o.createdAt)}</td>
              {showAddress && <td className="max-w-[220px] truncate px-3 py-2.5 text-secondary">{o.address}</td>}
              <td className="px-3 py-2.5 text-right tabular-nums">{formatKg(o.weightKg)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(o.amountDue)}</td>
              <td className="px-3 py-2.5"><OrderStatusBadge status={o.status} /></td>
              <td className="px-5 py-2.5"><PaymentBadge status={o.paymentStatus} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
