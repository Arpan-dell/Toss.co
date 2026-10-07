import type { Metadata } from "next";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { proGate } from "@/components/plan-gate";
import { Card, EmptyState, PageTitle, StatTile } from "@/components/ui";
import { updateCosts } from "@/lib/actions/supplies";
import { getTenantById, listDrivers, listOrders, now } from "@/lib/data";
import { earnings, monthStartIST, weekStartIST, type Earnings } from "@/lib/driver-pay";
import { formatINR } from "@/lib/format";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Driver pay" };

// Driver pay (Pro): what each driver earned from completed pickups at the laundry's rates, this week, last week
// and this month (IST weeks run Monday to Sunday). Drivers see the same numbers under "My earnings" in the bot.
export default async function DriverPay() {
  const locked = await proGate("Driver pay", "Pay drivers per pickup and per km without a notebook: Toss counts every pickup and the distance for you, and drivers can check their own earnings in the bot.");
  if (locked) return locked;

  const session = await getSession();
  const supabase = await createClient();
  const [tenant, drivers, orders, devices] = await Promise.all([
    getTenantById(session?.tenantId),
    listDrivers(),
    listOrders({ status: "COMPLETED" }),
    supabase.from("devices").select("device_id, lat, lng"),
  ]);
  if (!tenant) return null;

  const rates = { driverPayPerPickup: tenant.driverPayPerPickup, driverPayPerKm: tenant.driverPayPerKm };
  const store = tenant.storeLat != null && tenant.storeLng != null ? { lat: tenant.storeLat, lng: tenant.storeLng } : null;
  const where = new Map((devices.data ?? []).filter((d) => d.lat != null && d.lng != null).map((d) => [d.device_id as string, { lat: Number(d.lat), lng: Number(d.lng) }]));

  const today = now();
  const week = weekStartIST(today);
  const lastWeek = weekStartIST(today, 1);
  const month = monthStartIST(today);
  const done = orders.filter((o) => o.driverId && o.completedAt);
  const pay = (chatId: string, start: string, end?: string): Earnings =>
    earnings(
      done.filter((o) => o.driverId === chatId && o.completedAt! >= start && (!end || o.completedAt! < end)),
      rates,
      store,
      (id) => where.get(id),
    );

  const rows = drivers
    .filter((d) => d.telegramChatId)
    .map((d) => {
      const chatId = d.telegramChatId!;
      const mine = done.filter((o) => o.driverId === chatId && o.completedAt! >= month);
      return {
        d,
        thisWeek: pay(chatId, week),
        lastWeek: pay(chatId, lastWeek, week),
        thisMonth: pay(chatId, month),
        photos: mine.filter((o) => o.pickupPhotoAt).length,
        monthPickups: mine.length,
      };
    })
    .sort((a, b) => b.thisMonth.pay - a.thisMonth.pay);

  const total = (f: (r: (typeof rows)[number]) => Earnings) => rows.reduce((a, r) => a + f(r).pay, 0);
  const noRates = !rates.driverPayPerPickup && !rates.driverPayPerKm;

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker="Pro">Driver pay</PageTitle>

      {noRates && (
        <p role="status" className="rounded-[10px] border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn">
          Set what you pay per pickup (and per km, if you like) below. Until then every driver shows ₹0.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="This week" value={formatINR(total((r) => r.thisWeek))} />
        <StatTile label="Last week" value={formatINR(total((r) => r.lastWeek))} hint="Mon to Sun" />
        <StatTile label="This month" value={formatINR(total((r) => r.thisMonth))} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card title="By driver">
          {rows.length === 0 ? (
            <EmptyState>Drivers appear here once they connect to the driver bot (Fleet page).</EmptyState>
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
                    <th className="px-2 py-2 font-normal">Driver</th>
                    <th className="px-2 py-2 text-right font-normal">This week</th>
                    <th className="px-2 py-2 text-right font-normal">Last week</th>
                    <th className="px-2 py-2 text-right font-normal">This month</th>
                    <th className="px-2 py-2 text-right font-normal">Photo proof</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.d.id}>
                      <td className="px-2 py-2.5 font-medium text-fg">{r.d.name}</td>
                      {[r.thisWeek, r.lastWeek, r.thisMonth].map((e, i) => (
                        <td key={i} className="px-2 py-2.5 text-right tabular-nums">
                          <span className="font-semibold text-fg">{formatINR(e.pay)}</span>
                          <span className="block text-xs text-muted">
                            {e.pickups} pickup{e.pickups === 1 ? "" : "s"}
                            {e.km ? ` · ${e.km} km` : ""}
                          </span>
                        </td>
                      ))}
                      <td className="px-2 py-2.5 text-right text-muted tabular-nums">{r.monthPickups ? `${Math.round((r.photos / r.monthPickups) * 100)}%` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted">Distance is store to basket in a straight line, for baskets and a store that are on the map.</p>
        </Card>

        <Card title="Your rates">
          <ActionForm action={updateCosts} submitLabel="Save rates">
            <input type="hidden" name="otherCostPerKg" value={tenant.otherCostPerKg} />
            <Field label="Pay per pickup (₹)">
              <input name="driverPayPerPickup" type="number" min={0} step="any" defaultValue={tenant.driverPayPerPickup} className={fieldClass} />
            </Field>
            <Field label="Plus per km (₹)" hint="Store to basket. Leave 0 for a flat rate.">
              <input name="driverPayPerKm" type="number" min={0} step="any" defaultValue={tenant.driverPayPerKm} className={fieldClass} />
            </Field>
          </ActionForm>
          <p className="mt-3 text-xs text-muted">Drivers see their own earnings with 💰 My earnings in the driver bot. These rates also count as a cost on the Profit page.</p>
        </Card>
      </div>
    </div>
  );
}
