import type { Metadata } from "next";
import { ConfirmButton } from "@/components/confirm-button";
import { planGate } from "@/components/plan-gate";
import { Badge, Card, EmptyState, FillBar, OnlineBadge, PageTitle } from "@/components/ui";
import { deleteDriver, setDriverMaxJobs } from "@/lib/actions/manager-ops";
import { deviceLabel, isDeviceOnline, listActiveOrders, listCustomers, listDevices, listDrivers, listOrders, now, getTenantById } from "@/lib/data";
import { orderLabel, timeAgo } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { DriverBotQr } from "./driver-qr";
import { AddDriverForm, BasketEditor, DriverStatusControl } from "./forms";
import { getSession } from "@/lib/session";
import { driverRouteKm } from "@/lib/driver-routes";
import { startOfDay } from "@/lib/route-distance";
import { realBaskets } from "@/lib/rounds";
import type { Order } from "@/lib/types";

import { Tr } from "@/components/locale";
export const metadata: Metadata = { title: "Drivers" };

function signalLabel(rssi: number) {
  if (rssi >= -60) return "Strong";
  if (rssi >= -72) return "Fair";
  return "Weak";
}

export default async function Fleet() {
  const locked = await planGate();
  if (locked) return locked;

  const [allDevices, drivers, active, all, customers] = await Promise.all([
    listDevices(),
    listDrivers(),
    listActiveOrders(),
    listOrders(),
    listCustomers(),
  ]);
  // physical Toss baskets only (bookings without a basket hang on "virtual" ones)
  const devices = realBaskets(allDevices);
  const current = now();
  // kilometres each driver covered on jobs (stop to stop, from where they started): today, yesterday, this month
  const session = await getSession();
  const tenant = await getTenantById(session?.tenantId);
  const tz = tenant?.timezone || "Asia/Kolkata";
  const dayStart = startOfDay(current, tz);
  const yesterdayStart = startOfDay(new Date(new Date(dayStart).getTime() - 12 * 3_600_000), tz);
  const dayOfMonth = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, day: "numeric" }).format(current));
  const monthStart = startOfDay(new Date(new Date(dayStart).getTime() - (dayOfMonth - 1) * 86_400_000 + 12 * 3_600_000), tz);
  const none = new Map<string, number>();
  const [kmToday, kmYesterday, kmMonth] = tenant
    ? await Promise.all([driverRouteKm(all, tenant, dayStart), driverRouteKm(all, tenant, yesterdayStart, dayStart), driverRouteKm(all, tenant, monthStart)])
    : [none, none, none];
  const owner = new Map(customers.map((c) => [c.id, c]));
  const botUsername = process.env.TELEGRAM_DRIVER_BOT_USERNAME;

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker="Drivers & baskets"><Tr>{"Drivers"}</Tr></PageTitle>

      <Card title={`Drivers (${drivers.length})`}>
        <div className="mb-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
          <div>
            <AddDriverForm />
            <p className="mt-2 text-xs text-muted">
              {botUsername ? (
                <>
                  After you add a driver, they scan the QR code or open{" "}
                  <a href={`https://t.me/${botUsername}`} target="_blank" rel="noreferrer" className="font-mono text-fg underline">
                    @{botUsername}
                  </a>{" "}
                  and tap <span className="text-fg"><Tr>{"📱 Share my phone number"}</Tr></span>. Telegram confirms the number and they&apos;re connected.
                  Then they tap 🟢 Online and share their live location, and new pickups go to the nearest one automatically.
                </>
              ) : (
                <>Automatic dispatch turns on once the driver bot is connected.</>
              )}
            </p>
          </div>
          {botUsername && <DriverBotQr username={botUsername} />}
        </div>
        {drivers.length === 0 ? (
          <EmptyState><Tr>{"No drivers yet. Add your first one above."}</Tr></EmptyState>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              {drivers.map((drv) => {
                const chat = drv.telegramChatId;
                const pickedUp = (o: Order) => !!chat && o.driverId === chat;
                const delivered = (o: Order) => !!chat && o.deliveryDriverId === chat;
                const job = active.find((o) => pickedUp(o) && o.status === "ACCEPTED");
                const jobsToday =
                  all.filter((o) => pickedUp(o) && !!o.completedAt && o.completedAt >= dayStart).length +
                  all.filter((o) => delivered(o) && o.deliveryStatus === "DELIVERED" && !!o.deliveredAt && o.deliveredAt >= dayStart).length;
                const km = (m: Map<string, number>) => (chat && m.get(chat) ? `≈ ${m.get(chat)}` : "0");
                const age = drv.locationAt ? current.getTime() - new Date(drv.locationAt).getTime() : Infinity;
                const live = age < 30 * 60_000;
                const mapUrl = drv.location ? `https://www.google.com/maps/search/?api=1&query=${drv.location.lat},${drv.location.lng}` : null;
                return (
                  <article key={drv.id} className="space-y-4 rounded-[12px] border border-border bg-surface-solid p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-fg">{drv.name}</p>
                        {drv.phone ? (
                          <a href={`tel:${drv.phone}`} className="text-sm text-secondary tabular-nums hover:text-fg">
                            📞 {formatPhone(drv.phone)}
                          </a>
                        ) : (
                          <p className="font-mono text-xs text-muted">{chat}</p>
                        )}
                      </div>
                      {!chat ? <Badge tone="warn"><Tr>{"Not connected to Telegram yet"}</Tr></Badge> : <DriverStatusControl driverId={drv.id} name={drv.name} status={drv.status} />}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      {mapUrl ? (
                        <a
                          href={mapUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium transition-colors ${
                            live ? "border-good/40 bg-good-bg text-good hover:border-good" : "border-border-strong text-fg hover:border-accent hover:text-accent"
                          }`}
                        >
                          📍 {live ? "Live" : `Last seen ${timeAgo(drv.locationAt!, current)}`} · See on map ↗
                        </a>
                      ) : (
                        <span className="rounded-full border border-border px-3 py-1.5 text-muted"><Tr>{"📍 Location not shared yet"}</Tr></span>
                      )}
                      {!live && chat && drv.status !== "OFFLINE" && <span className="text-xs text-warn"><Tr>{"Old location: the bot is reminding them to share live location."}</Tr></span>}
                    </div>

                    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        ["Jobs today", String(jobsToday)],
                        ["Km today", km(kmToday)],
                        ["Km yesterday", km(kmYesterday)],
                        ["Km this month", km(kmMonth)],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-[8px] border border-border px-3 py-2">
                          <dt className="text-[11px] tracking-[0.08em] text-muted uppercase">{label}</dt>
                          <dd className="mt-0.5 text-lg font-semibold text-fg tabular-nums">{value}</dd>
                        </div>
                      ))}
                    </dl>

                    <p className="text-sm text-secondary">
                      <span className="text-muted"><Tr>{"Now:"}</Tr> </span>
                      {job ? `${orderLabel(job)} · ${job.address}` : "no job"}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                      <form action={setDriverMaxJobs} className="flex items-center gap-2 text-sm">
                        <input type="hidden" name="driverId" value={drv.id} />
                        <label htmlFor={`max-${drv.id}`} className="text-secondary"><Tr>{"Jobs at once"}</Tr></label>
                        <select id={`max-${drv.id}`} name="maxJobs" defaultValue={drv.maxJobs} className="rounded-lg border border-border bg-surface-solid px-2 py-1 text-sm">
                          {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                        <button className="text-sm text-accent hover:text-accent-2"><Tr>{"Save"}</Tr></button>
                      </form>
                      <ConfirmButton
                        action={deleteDriver}
                        fields={{ driverId: drv.id }}
                        label="Remove"
                        confirm={`Remove ${drv.name}? Their past pickups stay in your history.`}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
            <p className="mt-4 text-xs text-muted">
              Km is counted stop to stop on jobs, from where the driver was when given the job: pickups, the store and deliveries. Detours and
              trips home don&apos;t count.
            </p>
          </>
        )}
      </Card>

      <Card title={`Baskets (${devices.length})`}>
        {devices.length === 0 && <EmptyState>No baskets yet. They appear after a customer&apos;s basket sends its first order.</EmptyState>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((d) => {
            const c = d.customerId ? owner.get(d.customerId) : undefined;
            return (
              <div key={d.deviceId} className="rounded-[10px] border border-border bg-surface-solid p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{deviceLabel(d)}</p>
                    <p className="truncate text-xs text-secondary">{c ? `${c.name ?? c.email} · ${c.customerCode}` : "Owner not linked"}</p>
                    <p className="truncate font-mono text-[11px] text-muted">{d.deviceId}</p>
                  </div>
                  <OnlineBadge online={isDeviceOnline(d)} />
                </div>
                <div className="mt-4">
                  <FillBar weightKg={d.lastWeightKg} targetKg={d.targetKg} />
                </div>
                <p className="mt-3 text-xs text-muted">
                  {[
                    d.lastSeenAt ? `Seen ${timeAgo(d.lastSeenAt, current)}` : "Never seen",
                    d.wifiRssi !== undefined ? `Wi-Fi ${signalLabel(d.wifiRssi)}` : undefined,
                    d.firmwareVersion ? `fw ${d.firmwareVersion}` : "fw v1",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="mt-2">
                  <BasketEditor device={{ deviceId: d.deviceId, area: d.area, address: d.address, targetKg: d.targetKg }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
