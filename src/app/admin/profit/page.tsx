import type { Metadata } from "next";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { proGate } from "@/components/plan-gate";
import { Card, EmptyState, PageTitle, StatTile } from "@/components/ui";
import { updateCosts } from "@/lib/actions/supplies";
import { getPlatformSettings, getTenantById, listCustomers, listOrders, listSupplies, now } from "@/lib/data";
import { distanceKm } from "@/lib/dispatch/core";
import { formatINR, formatKg, orderLabel } from "@/lib/format";
import { orderProfit, supplyRates, type OrderProfit } from "@/lib/profit";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profit" };

// Profit per order and per customer (Pro): what each pickup earned after supplies, running costs and driver pay,
// over the last 30 days. The maths is lib/profit.ts.
export default async function Profit() {
  const locked = await proGate("Profit", "See what every order and every customer actually earns you after detergent, running costs and driver pay, not just revenue.");
  if (locked) return locked;

  const session = await getSession();
  const supabase = await createClient();
  const [tenant, platform, supplies, orders, customers, devices] = await Promise.all([
    getTenantById(session?.tenantId),
    getPlatformSettings(),
    listSupplies(),
    listOrders({ status: "COMPLETED" }),
    listCustomers(),
    supabase.from("devices").select("device_id, lat, lng"),
  ]);
  if (!tenant) return null;

  const costs = {
    otherCostPerKg: tenant.otherCostPerKg,
    driverPayPerPickup: tenant.driverPayPerPickup,
    driverPayPerKm: tenant.driverPayPerKm,
    tossSharePct: platform.creditTossSharePct,
  };
  const rates = supplyRates(supplies);
  const store = tenant.storeLat != null && tenant.storeLng != null ? { lat: tenant.storeLat, lng: tenant.storeLng } : null;
  const where = new Map((devices.data ?? []).filter((d) => d.lat != null && d.lng != null).map((d) => [d.device_id as string, { lat: d.lat as number, lng: d.lng as number }]));
  const names = new Map(customers.map((c) => [c.id, c.name ?? c.customerCode]));

  const since = now().getTime() - 30 * 86_400_000;
  const rows = orders
    .filter((o) => new Date(o.completedAt ?? o.createdAt).getTime() >= since)
    .map((o) => {
      const at = where.get(o.deviceId);
      const km = store && at ? distanceKm(store, at) : undefined;
      return { o, p: orderProfit(o, rates, costs, km) };
    });

  const sum = (f: (p: OrderProfit) => number) => rows.reduce((a, r) => a + f(r.p), 0);
  const kg = rows.reduce((a, r) => a + (r.o.weightKg || 0), 0);
  const profit = sum((p) => p.profit);
  const earned = sum((p) => p.paid + p.tossPayback);
  const costTotal = sum((p) => p.supplies + p.other + p.driver);

  // customers by profit per kg (2+ orders, so one odd order doesn't decide it)
  const byCustomer = new Map<string, { name: string; kg: number; profit: number; n: number }>();
  for (const { o, p } of rows) {
    if (!o.customerId) continue;
    const c = byCustomer.get(o.customerId) ?? { name: names.get(o.customerId) ?? "Customer", kg: 0, profit: 0, n: 0 };
    c.kg += o.weightKg || 0;
    c.profit += p.profit;
    c.n += 1;
    byCustomer.set(o.customerId, c);
  }
  const ranked = [...byCustomer.values()].filter((c) => c.n >= 2 && c.kg > 0).sort((a, b) => b.profit / b.kg - a.profit / a.kg);
  const noCosts = supplies.length === 0 && costs.otherCostPerKg === 0 && costs.driverPayPerPickup === 0;

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker="Pro · last 30 days">Profit</PageTitle>

      {noCosts && (
        <p role="status" className="rounded-[10px] border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn">
          Add your supplies (with their cost) and your running costs below, or profit just equals revenue.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Profit" value={formatINR(Math.round(profit))} />
        <StatTile label="Profit per kg" value={kg > 0 ? formatINR(Math.round((profit / kg) * 100) / 100) : "-"} />
        <StatTile label="Earned" value={formatINR(Math.round(earned))} />
        <StatTile label="Costs" value={formatINR(Math.round(costTotal))} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Customers by profit per kg">
          {ranked.length === 0 ? (
            <EmptyState>Customers with two or more pickups this month show here.</EmptyState>
          ) : (
            <ol className="divide-y divide-border text-sm">
              {[...ranked.slice(0, 5), ...(ranked.length > 8 ? ranked.slice(-3) : [])].map((c, i, all) => (
                <li key={`${c.name}-${i}`} className={`flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 ${i === 5 && all.length > 5 ? "border-t-2 border-border-strong" : ""}`}>
                  <span>
                    <span className="font-medium text-fg">{c.name}</span>
                    <span className="block text-xs text-muted">
                      {c.n} pickups · {formatKg(c.kg)}
                    </span>
                  </span>
                  <span className={`font-semibold tabular-nums ${c.profit < 0 ? "text-critical" : "text-fg"}`}>{formatINR(Math.round((c.profit / c.kg) * 100) / 100)}/kg</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title="Your running costs">
          <ActionForm action={updateCosts} submitLabel="Save costs">
            <Field label="Other cost per kg (₹)" hint="Water, power, labour: everything except supplies and drivers.">
              <input name="otherCostPerKg" type="number" min={0} step="any" defaultValue={tenant.otherCostPerKg} className={fieldClass} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Driver pay per pickup (₹)">
                <input name="driverPayPerPickup" type="number" min={0} step="any" defaultValue={tenant.driverPayPerPickup} className={fieldClass} />
              </Field>
              <Field label="Plus per km (₹)" hint="Store to basket.">
                <input name="driverPayPerKm" type="number" min={0} step="any" defaultValue={tenant.driverPayPerKm} className={fieldClass} />
              </Field>
            </div>
          </ActionForm>
          <p className="mt-3 text-xs text-muted">
            Supplies cost {formatINR(Math.round(rates.perKg * 100) / 100)}/kg + {formatINR(Math.round(rates.perOrder * 100) / 100)}/order, from the Supplies page.
          </p>
        </Card>
      </div>

      <Card title="Recent orders">
        {rows.length === 0 ? (
          <EmptyState>No completed pickups in the last 30 days.</EmptyState>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
                  <th className="px-2 py-2 font-normal">Order</th>
                  <th className="px-2 py-2 font-normal">Customer</th>
                  <th className="px-2 py-2 text-right font-normal">Weight</th>
                  <th className="px-2 py-2 text-right font-normal">Earned</th>
                  <th className="px-2 py-2 text-right font-normal">Costs</th>
                  <th className="px-2 py-2 text-right font-normal">Profit</th>
                  <th className="px-2 py-2 text-right font-normal">Per kg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.slice(0, 30).map(({ o, p }) => (
                  <tr key={o.id}>
                    <td className="px-2 py-2 font-mono text-xs">{orderLabel(o)}</td>
                    <td className="px-2 py-2">{(o.customerId && names.get(o.customerId)) ?? "-"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatKg(o.weightKg)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatINR(p.paid + p.tossPayback)}</td>
                    <td className="px-2 py-2 text-right text-muted tabular-nums">{formatINR(p.supplies + p.other + p.driver)}</td>
                    <td className={`px-2 py-2 text-right font-semibold tabular-nums ${p.profit < 0 ? "text-critical" : "text-fg"}`}>{formatINR(p.profit)}</td>
                    <td className="px-2 py-2 text-right text-muted tabular-nums">{p.perKg === null ? "-" : formatINR(p.perKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
