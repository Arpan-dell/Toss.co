import type { Metadata } from "next";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { proGate } from "@/components/plan-gate";
import { Badge, Card, EmptyState, PageTitle, StatTile } from "@/components/ui";
import { setDriverPay, updateCosts } from "@/lib/actions/supplies";
import { getTenantById, listDrivers, listOrders, now } from "@/lib/data";
import { earnings, monthStartIST, weekStartIST, type Earnings } from "@/lib/driver-pay";
import { formatINR } from "@/lib/format";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Driver pay" };

const trips = (n: number) => `${n} trip${n === 1 ? "" : "s"}`;

// Driver pay (Pro). Each driver is paid per trip (a pickup or a delivery, at the laundry's rate plus per km) or a
// fixed monthly salary. Per-trip pay is counted for this week, last week and this month (IST, Monday to Sunday);
// for salaried drivers the page shows what each trip costs. Drivers see their own numbers under "My earnings".
export default async function DriverPay() {
  const locked = await proGate(
    "Driver pay",
    "Pay drivers per trip or by salary without a notebook: Toss counts every pickup, delivery and kilometre, and drivers check their own earnings in the bot.",
  );
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
  // a trip is a pickup (to the store) or a delivery (back to the customer)
  const allTrips = [
    ...done.map((o) => ({ chatId: o.driverId!, deviceId: o.deviceId, at: o.completedAt! })),
    ...orders.filter((o) => o.deliveryStatus === "DELIVERED" && o.deliveryDriverId && o.deliveredAt).map((o) => ({ chatId: o.deliveryDriverId!, deviceId: o.deviceId, at: o.deliveredAt! })),
  ];
  const pay = (chatId: string, start: string, end?: string): Earnings =>
    earnings(
      allTrips.filter((t) => t.chatId === chatId && t.at >= start && (!end || t.at < end)),
      rates,
      store,
      (id) => where.get(id),
    );

  const rows = drivers
    .filter((d) => d.telegramChatId)
    .map((d) => {
      const chatId = d.telegramChatId!;
      const mine = done.filter((o) => o.driverId === chatId && o.completedAt! >= month);
      const salaried = d.payType === "SALARY";
      const thisMonth = pay(chatId, month);
      return {
        d,
        salaried,
        thisWeek: pay(chatId, week),
        lastWeek: pay(chatId, lastWeek, week),
        thisMonth,
        // what the business pays this month: trip pay, or the salary
        monthCost: salaried ? d.monthlySalary : thisMonth.pay,
        perTrip: salaried && thisMonth.pickups ? Math.round(d.monthlySalary / thisMonth.pickups) : null,
        photos: mine.filter((o) => o.pickupPhotoAt).length,
        monthPickups: mine.length,
      };
    })
    .sort((a, b) => b.monthCost - a.monthCost);

  const tripTotal = (f: (r: (typeof rows)[number]) => Earnings) => rows.filter((r) => !r.salaried).reduce((a, r) => a + f(r).pay, 0);
  const salaries = rows.filter((r) => r.salaried).reduce((a, r) => a + r.d.monthlySalary, 0);
  const anyTrip = rows.some((r) => !r.salaried);
  const noRates = anyTrip && !rates.driverPayPerPickup && !rates.driverPayPerKm;

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker="Pro">Driver pay</PageTitle>

      {noRates && (
        <p role="status" className="rounded-[10px] border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn">
          Some drivers are paid per trip, but no rate is set yet. Set it under <b>Per-trip rate</b> below; until then they show ₹0.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Trip pay this week" value={formatINR(tripTotal((r) => r.thisWeek))} />
        <StatTile label="Trip pay last week" value={formatINR(tripTotal((r) => r.lastWeek))} hint="Mon to Sun" />
        <StatTile label="This month in all" value={formatINR(tripTotal((r) => r.thisMonth) + salaries)} hint={salaries ? `incl. ${formatINR(salaries)} salaries` : undefined} />
      </div>

      <Card title="By driver">
        {rows.length === 0 ? (
          <EmptyState>Drivers appear here once they connect to the driver bot (Fleet page).</EmptyState>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
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
                    <td className="px-2 py-2.5">
                      <span className="font-medium text-fg">{r.d.name}</span>
                      <span className="mt-0.5 block">
                        <Badge tone={r.salaried ? "info" : "neutral"}>{r.salaried ? `Salary ${formatINR(r.d.monthlySalary)}/mo` : "Per trip"}</Badge>
                      </span>
                    </td>
                    {[r.thisWeek, r.lastWeek].map((e, i) => (
                      <td key={i} className="px-2 py-2.5 text-right tabular-nums">
                        {!r.salaried && <span className="font-semibold text-fg">{formatINR(e.pay)}</span>}
                        <span className="block text-xs text-muted">
                          {trips(e.pickups)}
                          {e.km ? ` · ${e.km} km` : ""}
                        </span>
                      </td>
                    ))}
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      <span className="font-semibold text-fg">{formatINR(r.monthCost)}</span>
                      <span className="block text-xs text-muted">
                        {trips(r.thisMonth.pickups)}
                        {r.perTrip !== null ? ` · ${formatINR(r.perTrip)} a trip` : ""}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-right text-muted tabular-nums">{r.monthPickups ? `${Math.round((r.photos / r.monthPickups) * 100)}%` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted">A trip is a pickup or a delivery. Distance is store to basket in a straight line, for baskets and a store on the map.</p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="How each driver is paid">
          {drivers.length === 0 ? (
            <EmptyState>Add drivers on the Fleet page first.</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {drivers.map((d) => (
                <li key={d.id} className="py-3 first:pt-0 last:pb-0">
                  <ActionForm action={setDriverPay} submitLabel="Save" className="flex flex-wrap items-end gap-2" submitClassName="btn-ghost rounded-full px-4 py-2 text-sm font-medium">
                    <input type="hidden" name="driverId" value={d.id} />
                    <span className="w-full text-sm font-medium text-fg sm:w-28">{d.name}</span>
                    <label className="text-xs text-secondary">
                      <span className="sr-only">Pay type for {d.name}</span>
                      <select name="payType" defaultValue={d.payType} className="rounded-[8px] border border-border bg-surface-solid px-3 py-2 text-sm text-fg">
                        <option value="TRIP">Per trip</option>
                        <option value="SALARY">Monthly salary</option>
                      </select>
                    </label>
                    <label className="text-xs text-secondary">
                      <span className="sr-only">Monthly salary for {d.name} (₹)</span>
                      <input
                        name="monthlySalary"
                        type="number"
                        min={0}
                        step="any"
                        defaultValue={d.monthlySalary || ""}
                        placeholder="Salary ₹/month"
                        className="w-36 rounded-[8px] border border-border bg-ink/[0.03] px-3 py-2 text-sm"
                      />
                    </label>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">The salary only counts for drivers set to Monthly salary.</p>
        </Card>

        <Card title="Per-trip rate">
          <ActionForm action={updateCosts} submitLabel="Save rates">
            <input type="hidden" name="otherCostPerKg" value={tenant.otherCostPerKg} />
            <Field label="Pay per trip (₹)" hint="Each pickup and each delivery.">
              <input name="driverPayPerPickup" type="number" min={0} step="any" defaultValue={tenant.driverPayPerPickup} className={fieldClass} />
            </Field>
            <Field label="Plus per km (₹)" hint="Store to basket. Leave 0 for a flat rate.">
              <input name="driverPayPerKm" type="number" min={0} step="any" defaultValue={tenant.driverPayPerKm} className={fieldClass} />
            </Field>
          </ActionForm>
          <p className="mt-3 text-xs text-muted">Drivers see their own pay with 💰 My earnings in the driver bot. Driver pay also counts as a cost on the Profit page.</p>
        </Card>
      </div>
    </div>
  );
}
