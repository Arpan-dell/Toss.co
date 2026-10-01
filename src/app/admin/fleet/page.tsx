import type { Metadata } from "next";
import { planGate } from "@/components/plan-gate";
import { Badge, Card, EmptyState, FillBar, OnlineBadge, PageTitle } from "@/components/ui";
import { deviceLabel, isDeviceOnline, listActiveOrders, listDevices, listDrivers, listOrders, now } from "@/lib/data";
import { orderLabel, timeAgo } from "@/lib/format";
import type { DriverStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Fleet" };

const driverStatus: Record<DriverStatus, { tone: "good" | "info" | "neutral"; icon: string; label: string; live?: boolean }> = {
  AVAILABLE: { tone: "good", icon: "●", label: "Available", live: true },
  ON_JOB: { tone: "info", icon: "🚚", label: "On a job" },
  OFFLINE: { tone: "neutral", icon: "○", label: "Offline" },
};

function signalLabel(rssi: number) {
  if (rssi >= -60) return "Strong";
  if (rssi >= -72) return "Fair";
  return "Weak";
}

export default async function Fleet() {
  const locked = await planGate();
  if (locked) return locked;

  const [devices, drivers, active, all] = await Promise.all([listDevices(), listDrivers(), listActiveOrders(), listOrders()]);
  const current = now();
  const todayKey = current.toISOString().slice(0, 10);

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker="Devices & drivers">Fleet</PageTitle>

      <Card title={`Baskets (${devices.length})`}>
        {devices.length === 0 && <EmptyState>No baskets yet. They appear here after their first order or heartbeat.</EmptyState>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((d) => {
            const online = isDeviceOnline(d);
            return (
              <div key={d.deviceId} className="glow-card rounded-xl border border-border bg-white/[0.02] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{deviceLabel(d)}</p>
                    <p className="font-mono text-xs text-muted">{d.deviceId}</p>
                  </div>
                  <OnlineBadge online={online} />
                </div>
                <div className="mt-4">
                  <FillBar weightKg={d.lastWeightKg} targetKg={d.targetKg} />
                </div>
                <p className="mt-3 text-xs text-muted">
                  {[
                    d.lastSeenAt ? `Seen ${timeAgo(d.lastSeenAt, current)}` : "Never seen",
                    d.wifiRssi !== undefined ? `Wi-Fi ${signalLabel(d.wifiRssi)} (${d.wifiRssi} dBm)` : undefined,
                    d.firmwareVersion ? `fw ${d.firmwareVersion}` : "fw v1 (via Sheet bridge)",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title={`Drivers (${drivers.length})`}>
        {drivers.length === 0 && (
          <EmptyState>No drivers registered yet. Driver management arrives with the manager tools in Phase E.</EmptyState>
        )}
        <div className={`-mx-5 overflow-x-auto ${drivers.length === 0 ? "hidden" : ""}`}>
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] tracking-[0.12em] text-muted uppercase">
                <th className="px-5 py-2 font-medium">Driver</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Current job</th>
                <th className="px-5 py-2 text-right font-medium">Pickups today</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((drv) => {
                const job = active.find((o) => o.driverId === drv.telegramChatId && o.status === "ACCEPTED");
                const today = all.filter((o) => o.driverId === drv.telegramChatId && o.completedAt?.startsWith(todayKey)).length;
                const s = driverStatus[drv.status];
                return (
                  <tr key={drv.id} className="border-b border-border transition-colors last:border-0 hover:bg-white/[0.03]">
                    <td className="px-5 py-2.5 font-medium">{drv.name}</td>
                    <td className="px-3 py-2.5"><Badge tone={s.tone} icon={s.icon} live={s.live}>{s.label}</Badge></td>
                    <td className="px-3 py-2.5 text-secondary">{job ? `${orderLabel(job)} · ${job.address}` : "—"}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{today}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
