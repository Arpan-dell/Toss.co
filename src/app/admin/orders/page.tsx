import type { Metadata } from "next";
import { currentTier, planGate } from "@/components/plan-gate";
import Link from "next/link";
import { MicrosoftExcelLogo } from "@phosphor-icons/react/dist/ssr";
import { OrderTable } from "@/components/order-table";
import { Card, PageTitle } from "@/components/ui";
import { listOrders, now } from "@/lib/data";
import { orderStage, STAGE_FILTERS } from "@/lib/order-stage";
import { bookForCustomer } from "@/lib/actions/bookings";
import { NewPickup } from "./new-pickup";

export const metadata: Metadata = { title: "Orders" };

const FREE_HISTORY_DAYS = 60;

// what's with drivers, in the wash, ready or out for delivery, and finished (see lib/order-stage.ts)
const FILTERS: { label: string; stage?: string }[] = [{ label: "All" }, ...STAGE_FILTERS.map((f) => ({ label: f.label, stage: f.key }))];

export default async function AdminOrders({ searchParams }: PageProps<"/admin/orders">) {
  const locked = await planGate();
  if (locked) return locked;

  const params = await searchParams;
  const stage = STAGE_FILTERS.find((f) => f.key === params.stage);
  const q = typeof params.q === "string" ? params.q : undefined;
  const [all, tier] = await Promise.all([listOrders({ q }), currentTier()]);
  const pro = tier?.tier === "PRO";
  // Toss Free keeps the last 60 days on screen; Pro keeps the whole history
  const cutoff = now().getTime() - FREE_HISTORY_DAYS * 86_400_000;
  const inWindow = pro ? all : all.filter((o) => new Date(o.createdAt).getTime() >= cutoff);
  const orders = stage ? inWindow.filter((o) => stage.stages.includes(orderStage(o).key)) : inWindow;
  const hidden = all.length - inWindow.length;

  // the export takes the same filter and search, so the file matches what's on screen
  const exportQs = new URLSearchParams();
  if (q) exportQs.set("q", q);
  const exportHref = `/admin/orders/export${exportQs.size ? `?${exportQs}` : ""}`;

  const href = (s?: string) => {
    const p = new URLSearchParams();
    if (s) p.set("stage", s);
    if (q) p.set("q", q);
    const qs = p.toString();
    return qs ? `/admin/orders?${qs}` : "/admin/orders";
  };

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker="All baskets">Orders</PageTitle>

      <Card id="new-pickup" title="New pickup">
        <details>
          <summary className="cursor-pointer text-sm font-medium text-accent">Book a pickup for a customer who phoned or messaged you</summary>
          <div className="mt-4">
            <NewPickup action={bookForCustomer} />
          </div>
        </details>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-[18px] border border-border bg-ink/[0.03] p-1 text-sm">
          {FILTERS.map((f) => (
            <Link
              key={f.label}
              href={href(f.stage)}
              aria-current={f.stage === stage?.key ? "page" : undefined}
              data-ripple
              className={`rounded-full px-3.5 py-1 transition-colors ${f.stage === stage?.key ? "bg-ink/10 font-medium text-fg shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]" : "text-muted hover:text-fg"}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <form className="flex-1 sm:max-w-xs">
          {stage && <input type="hidden" name="stage" value={stage.key} />}
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

      {hidden > 0 && (
        <p className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-dashed border-border-strong px-4 py-3 text-sm text-secondary">
          <span>
            🔒 <span className="font-medium text-fg">{hidden} older orders</span> are hidden. Toss Free shows the last {FREE_HISTORY_DAYS} days; Pro keeps your whole
            history.
          </span>
          <Link href="/admin/billing" className="btn-primary rounded-full px-4 py-1.5 text-sm font-medium">
            Unlock history →
          </Link>
        </p>
      )}

      <Card>
        <OrderTable orders={orders} showAddress linkToAdmin emptyText="No orders match this filter." />
      </Card>
    </div>
  );
}
