import type { Metadata } from "next";
import { currentTier, planGate } from "@/components/plan-gate";
import Link from "next/link";
import { MicrosoftExcelLogo } from "@phosphor-icons/react/dist/ssr";
import { OrderTable } from "@/components/order-table";
import { Card, PageTitle } from "@/components/ui";
import { listOrders } from "@/lib/data";
import type { OrderStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Orders" };

const FILTERS: { label: string; status?: OrderStatus }[] = [
  { label: "All" },
  { label: "Pending", status: "PENDING" },
  { label: "En route", status: "ACCEPTED" },
  { label: "Completed", status: "COMPLETED" },
];

export default async function AdminOrders({ searchParams }: PageProps<"/admin/orders">) {
  const locked = await planGate();
  if (locked) return locked;

  const params = await searchParams;
  const status = FILTERS.find((f) => f.status === params.status)?.status;
  const q = typeof params.q === "string" ? params.q : undefined;
  const [orders, tier] = await Promise.all([listOrders({ status, q }), currentTier()]);
  const pro = tier?.tier === "PRO";

  // the export takes the same filter and search, so the file matches what's on screen
  const exportQs = new URLSearchParams();
  if (status) exportQs.set("status", status);
  if (q) exportQs.set("q", q);
  const exportHref = `/admin/orders/export${exportQs.size ? `?${exportQs}` : ""}`;

  const href = (s?: OrderStatus) => {
    const p = new URLSearchParams();
    if (s) p.set("status", s);
    if (q) p.set("q", q);
    const qs = p.toString();
    return qs ? `/admin/orders?${qs}` : "/admin/orders";
  };

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker="All baskets">Orders</PageTitle>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full border border-border bg-ink/[0.03] p-1 text-sm">
          {FILTERS.map((f) => (
            <Link
              key={f.label}
              href={href(f.status)}
              aria-current={f.status === status ? "page" : undefined}
              data-ripple
              className={`rounded-full px-3.5 py-1 transition-colors ${f.status === status ? "bg-ink/10 font-medium text-fg shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]" : "text-muted hover:text-fg"}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <form className="flex-1 sm:max-w-xs">
          {status && <input type="hidden" name="status" value={status} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search address, order or Telegram ID"
            className="w-full rounded-full border border-border bg-ink/[0.03] px-4 py-1.5 text-sm transition-shadow placeholder:text-muted focus:border-accent/60 focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.2)] focus:outline-none"
          />
        </form>
        <p className="text-sm text-muted">{orders.length} orders</p>
        {/* Pro: the export; Free: the same button leads to the upgrade */}
        <a
          href={pro ? exportHref : "/admin/billing"}
          download={pro || undefined}
          className="btn-ghost ml-auto inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium text-fg"
          aria-disabled={(pro && orders.length === 0) || undefined}
        >
          <MicrosoftExcelLogo size={16} weight="fill" className="text-good" aria-hidden />
          Download Excel
          {!pro && <span className="rounded-[4px] bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-accent">PRO</span>}
        </a>
      </div>

      <Card>
        <OrderTable orders={orders} showAddress linkToAdmin emptyText="No orders match this filter." />
      </Card>
    </div>
  );
}
