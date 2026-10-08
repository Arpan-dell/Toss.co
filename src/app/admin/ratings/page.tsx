import { BackLink } from "@/components/back-link";
import type { Metadata } from "next";
import { OrderLink } from "@/components/order-link";
import Link from "next/link";
import { proGate } from "@/components/plan-gate";
import { Card, EmptyState, PageTitle, StatTile } from "@/components/ui";
import { getTenantById, listCustomers, listOrders } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Ratings" };

// Ratings (Pro): customers rate each paid pickup from the link in their invoice. Low ratings come first so the
// manager can follow up; happy customers were pointed at the laundry's Google review page.
export default async function Ratings() {
  const locked = await proGate("Ratings", "See how customers rate every pickup, catch unhappy ones early, and send happy ones to your Google reviews.");
  if (locked) return locked;

  const session = await getSession();
  const [orders, customers, tenant] = await Promise.all([listOrders(), listCustomers(), getTenantById(session?.tenantId)]);
  const rated = orders.filter((o) => o.rating).sort((a, b) => (b.ratedAt ?? "").localeCompare(a.ratedAt ?? ""));
  const names = new Map(customers.map((c) => [c.id, c.name ?? c.customerCode]));
  const count = (n: number) => rated.filter((o) => o.rating === n).length;
  const avg = rated.length ? rated.reduce((a, o) => a + (o.rating ?? 0), 0) / rated.length : 0;
  const happy = rated.length ? Math.round((rated.filter((o) => (o.rating ?? 0) >= 4).length / rated.length) * 100) : 0;
  const paid = orders.filter((o) => o.paymentStatus === "PAID").length;
  const low = rated.filter((o) => (o.rating ?? 0) <= 3);

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker="Pro">Ratings</PageTitle>
      <BackLink />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Average" value={rated.length ? `${avg.toFixed(1)} ★` : "-"} />
        <StatTile label="Ratings" value={String(rated.length)} />
        <StatTile label="4 or 5 stars" value={rated.length ? `${happy}%` : "-"} />
        <StatTile label="Response rate" value={paid ? `${Math.round((rated.length / paid) * 100)}%` : "-"} hint="of paid pickups" />
      </div>

      {!tenant?.googleReviewUrl && (
        <p className="rounded-[10px] border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn">
          Add your Google review link under{" "}
          <Link href="/admin/settings/operations" className="underline">
            Settings → How you work
          </Link>{" "}
          so customers who rate you 4–5 stars are asked to post a review.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card title="Stars">
          <ul className="space-y-2.5">
            {[5, 4, 3, 2, 1].map((n) => (
              <li key={n} className="flex items-center gap-3 text-sm">
                <span className="w-8 shrink-0 text-muted tabular-nums">{n} ★</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10">
                  <span className={`block h-full rounded-full ${n >= 4 ? "bg-good" : n === 3 ? "bg-warn" : "bg-critical"}`} style={{ width: `${rated.length ? (count(n) / rated.length) * 100 : 0}%` }} />
                </span>
                <span className="w-8 text-right text-muted tabular-nums">{count(n)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={low.length ? `Follow up (${low.length})` : "Recent ratings"}>
          {rated.length === 0 ? (
            <EmptyState>Ratings arrive after customers pay: their invoice has a one-tap link.</EmptyState>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {(low.length ? low : rated).slice(0, 12).map((o) => (
                <li key={o.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className={o.rating! <= 2 ? "text-critical" : o.rating === 3 ? "text-warn" : "text-good"}>{"★".repeat(o.rating!)}</span>{" "}
                      <span className="font-medium text-fg">{(o.customerId && names.get(o.customerId)) ?? "Customer"}</span>{" "}
                      <OrderLink order={o} />
                    </span>
                    {o.ratedAt && <span className="text-xs text-muted">{formatDateTime(o.ratedAt)}</span>}
                  </div>
                  {o.ratingComment && <p className="mt-1 text-secondary">“{o.ratingComment}”</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
