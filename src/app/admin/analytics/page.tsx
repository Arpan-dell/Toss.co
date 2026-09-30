import type { Metadata } from "next";
import { AiInsights } from "@/components/ai-insights";
import { ColumnChart, LineChart } from "@/components/charts";
import { Card, EmptyState, PageTitle, StatTile } from "@/components/ui";
import { computeAggregates } from "@/lib/analytics";
import { listOrders } from "@/lib/data";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Analytics" };

export default async function Analytics() {
  const agg = computeAggregates(await listOrders());
  // First and current weeks are partial and would read as false dips, so chart complete weeks only.
  const weekly = agg.byWeek.slice(1, -1).map((w) => ({
    label: formatDate(w.weekStart),
    value: w.kg,
    detail: `${w.orders} pickups`,
  }));
  const weekday = agg.byWeekday.map((d) => ({ label: d.day, value: d.kg, detail: `${d.orders} pickups` }));

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker="Insights">Analytics</PageTitle>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Pickups" value={agg.totalOrders.toLocaleString("en-IN")} hint={`Last ${agg.byWeek.length} weeks`} />
        <StatTile label="Laundry handled" value={`${Math.round(agg.totalKg).toLocaleString("en-IN")} kg`} />
        <StatTile label="Avg pickup size" value={`${(agg.totalKg / Math.max(1, agg.totalOrders)).toFixed(1)} kg`} />
        <StatTile label="Avg time to pickup" value={`${agg.avgTurnaroundHrs} h`} hint="Basket full → picked up" />
      </div>

      <Card title="AI demand forecast">
        <AiInsights />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Laundry by day of week (kg)">
          {agg.totalOrders > 0 ? <ColumnChart data={weekday} unit="kg" /> : <EmptyState>No orders yet.</EmptyState>}
        </Card>
        <Card title="Weekly laundry volume (kg, complete weeks)">
          {weekly.length >= 2 ? (
            <LineChart data={weekly} unit="kg" />
          ) : (
            <EmptyState>Needs at least two complete weeks of orders.</EmptyState>
          )}
        </Card>
      </div>

      <Card>
        <details>
          <summary className="cursor-pointer text-sm font-medium">Show data table</summary>
          <table className="mt-4 w-full max-w-md text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] tracking-[0.12em] text-muted uppercase">
                <th className="py-2 font-medium">Week starting</th>
                <th className="py-2 text-right font-medium">Pickups</th>
                <th className="py-2 text-right font-medium">kg</th>
              </tr>
            </thead>
            <tbody>
              {agg.byWeek.map((w) => (
                <tr key={w.weekStart} className="border-b border-border last:border-0">
                  <td className="py-2">{formatDate(w.weekStart)}</td>
                  <td className="py-2 text-right tabular-nums">{w.orders}</td>
                  <td className="py-2 text-right tabular-nums">{w.kg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>
    </div>
  );
}
