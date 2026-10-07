import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import { orderLabel } from "@/lib/format";

// An order number that clearly looks clickable (a small pill with an arrow): opens the order's full page.
export function OrderLink({ order }: { order: { id: string; deviceId: string; deviceOrderId: number } }) {
  return (
    <Link
      href={`/admin/orders/${encodeURIComponent(order.id)}`}
      title="Open this order"
      className="inline-flex items-center gap-0.5 rounded-full border border-accent/35 bg-accent/[0.08] px-2 py-0.5 font-mono text-xs font-medium whitespace-nowrap text-accent transition-colors hover:border-accent/60 hover:bg-accent/15"
    >
      {orderLabel(order)}
      <CaretRight size={11} weight="bold" aria-hidden />
    </Link>
  );
}
