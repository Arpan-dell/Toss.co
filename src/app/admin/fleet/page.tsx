import type { Metadata } from "next";
import { ConfirmButton } from "@/components/confirm-button";
import { planGate } from "@/components/plan-gate";
import { Badge, Card, EmptyState, FillBar, OnlineBadge, PageTitle } from "@/components/ui";
import { deleteDriver, setDriverMaxJobs, setDriverStatus } from "@/lib/actions/manager-ops";
import { deviceLabel, isDeviceOnline, listActiveOrders, listCustomers, listDevices, listDrivers, listOrders, now } from "@/lib/data";
import { orderLabel, timeAgo } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import type { DriverStatus } from "@/lib/types";
import { AddDriverForm, BasketEditor } from "./forms";

export const metadata: Metadata = { title: "Fleet" };

const STATUS: Record<DriverStatus, { tone: "good" | "info" | "neutral"; label: string; live?: boolean }> = {
  AVAILABLE: { tone: "good", label: "Available", live: true },
  ON_JOB: { tone: "info", label: "On a job" },
  OFFLINE: { tone: "neutral", label: "Offline" },
};

function signalLabel(rssi: number) {
  if (rssi >= -60) return "Strong";
  if (rssi >= -72) return "Fair";
  return "Weak";
}

export default async function Fleet() {
  const locked = await planGate();
  if (locked) return locked;

  const [devices, drivers, active, all, customers] = await Promise.all([
    listDevices(),
    listDrivers(),
    listActiveOrders(),
    listOrders(),
    listCustomers(),
  ]);
  const current = now();
  const todayKey = current.toISOString().slice(0, 10);
  const owner = new Map(customers.map((c) => [c.id, c]));

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker="Baskets & drivers">Fleet</PageTitle>

      <Card title={`Drivers (${drivers.length})`}>
        <div className="mb-5">
          <AddDriverForm />
          <p className="mt-2 text-xs text-muted">
            {process.env.TELEGRAM_DRIVER_BOT_USERNAME ? (
              <>
                After you add a driver, they open{" "}
                <a href={`https://t.me/${process.env.TELEGRAM_DRIVER_BOT_USERNAME}`} target="_blank" rel="noreferrer" className="font-mono text-fg underline">
                  @{process.env.TELEGRAM_DRIVER_BOT_USERNAME}
                </a>{" "}
                and tap <span className="text-fg">📱 Share my phone number</span>. Telegram confirms the number and they&apos;re connected.
                Then they tap 🟢 Online and share their live location, and new pickups go to the nearest one automatically.
              </>
            ) : (
              <>Automatic dispatch turns on once the driver bot is connected.</>
            )}
          </p>
        </div>
        {drivers.length === 0 ? (
          <EmptyState>No drivers yet. Add your first one above.</EmptyState>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] tracking-[0.12em] text-muted uppercase">
                  <th className="px-5 py-2 font-medium">Driver</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Location</th>
                  <th className="px-3 py-2 font-medium">Current job</th>
                  <th className="px-3 py-2 text-right font-medium">Today</th>
                  <th className="px-3 py-2 font-medium">Max at once</th>
                  <th className="px-5 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {drivers.map((drv) => {
                  const mine = (o: { driverId?: string }) => !!drv.telegramChatId && o.driverId === drv.telegramChatId;
                  const job = active.find((o) => mine(o) && o.status === "ACCEPTED");
                  const today = all.filter((o) => mine(o) && o.completedAt?.startsWith(todayKey)).length;
                  const s = STATUS[drv.status];
                  return (
                    <tr key={drv.id} className="border-b border-border transition-colors last:border-0 hover:bg-white/[0.03]">
                      <td className="px-5 py-2.5">
                        <p className="font-medium">{drv.name}</p>
                        {drv.phone ? (
                          <a href={`tel:${drv.phone}`} className="text-xs text-muted tabular-nums hover:text-fg">
                            {formatPhone(drv.phone)}
                          </a>
                        ) : (
                          <p className="font-mono text-xs text-muted">{drv.telegramChatId}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {!drv.telegramChatId ? (
                          <Badge tone="warn" icon="!">Not connected to Telegram yet</Badge>
                        ) : (
                          <form action={setDriverStatus} className="flex items-center gap-2">
                            <input type="hidden" name="driverId" value={drv.id} />
                            <Badge tone={s.tone} icon="●" live={s.live}>{s.label}</Badge>
                            <select
                              name="status"
                              defaultValue={drv.status}
                              aria-label={`Change ${drv.name}'s status`}
                              className="rounded-lg border border-border bg-surface-solid px-2 py-1 text-xs"
                            >
                              <option value="AVAILABLE">Available</option>
                              <option value="ON_JOB">On a job</option>
                              <option value="OFFLINE">Offline</option>
                            </select>
                            <button className="text-xs text-accent hover:text-accent-2">Set</button>
                          </form>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {drv.location && drv.locationAt ? (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${drv.location.lat},${drv.location.lng}`}
                            target="_blank"
                            rel="noreferrer"
                            className={current.getTime() - new Date(drv.locationAt).getTime() < 30 * 60_000 ? "text-good" : "text-muted"}
                          >
                            📍 {timeAgo(drv.locationAt, current)}
                          </a>
                        ) : (
                          <span className="text-muted">Not shared</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-secondary">{job ? `${orderLabel(job)} · ${job.address}` : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{today}</td>
                      <td className="px-3 py-2.5">
                        <form action={setDriverMaxJobs} className="flex items-center gap-1.5">
                          <input type="hidden" name="driverId" value={drv.id} />
                          <select name="maxJobs" defaultValue={drv.maxJobs} aria-label={`Max pickups at once for ${drv.name}`} className="rounded-lg border border-border bg-surface-solid px-2 py-1 text-xs">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                          <button className="text-xs text-accent hover:text-accent-2">Set</button>
                        </form>
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <ConfirmButton
                          action={deleteDriver}
                          fields={{ driverId: drv.id }}
                          label="Remove"
                          confirm={`Remove ${drv.name}? Their past pickups stay in your history.`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Baskets (${devices.length})`}>
        {devices.length === 0 && <EmptyState>No baskets yet. They appear after a customer&apos;s basket sends its first order.</EmptyState>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((d) => {
            const c = d.customerId ? owner.get(d.customerId) : undefined;
            return (
              <div key={d.deviceId} className="glow-card rounded-xl border border-border bg-white/[0.02] p-4">
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
                  <BasketEditor device={d} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
