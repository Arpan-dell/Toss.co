import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AreaMap } from "@/components/area-map";
import { MAX_WAYPOINTS } from "@/lib/dispatch/core";
import { planByToken } from "@/lib/dispatch/service";

export const metadata: Metadata = { title: "My route", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const TONE = { pickup: "bg-[#f97316]", delivery: "bg-[#16a34a]", store: "bg-[#2563eb]" } as const;

// "My route" link from the driver bot: /r/<secret token>. Every open pickup and delivery, in the order to do them
// (nearest first, through the store), as numbered pins on a map, each with its own Navigate button, plus the whole
// trip as one Google Maps route. Worked out fresh on every open, so new jobs show up straight away.
export default async function DriverRoute({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{36}$/.test(token)) notFound();
  const plan = await planByToken(token);
  if (!plan) notFound();
  const pins = plan.stops.filter((s) => s.point).map((s) => ({ lat: s.point!.lat, lng: s.point!.lng, label: `${s.n}. ${s.title}`, n: s.n, tone: s.kind }));
  const jobs = plan.stops.filter((s) => s.kind !== "store").length;

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6 outline-none">
      <div>
        <p className="font-mono text-[11px] tracking-[0.14em] text-accent uppercase">Toss Handy · {plan.name}</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">{jobs ? `My route · ${jobs} stop${jobs > 1 ? "s" : ""}` : "No open jobs"}</h1>
      </div>

      {!jobs ? (
        <p className="rounded-[10px] border border-border p-5 text-sm text-secondary">🧺 Nothing open right now. New pickups and deliveries arrive in your Telegram bot.</p>
      ) : (
        <>
          {pins.length > 0 && (
            <AreaMap center={[pins[0].lat, pins[0].lng]} zoom={13} pins={pins} you={plan.here ? [plan.here.lat, plan.here.lng] : undefined} className="h-80" />
          )}
          {plan.url && (
            <a href={plan.url} target="_blank" rel="noopener" className="btn-primary flex w-full justify-center rounded-full px-5 py-3 text-sm font-semibold">
              🛣 Start the whole route in Google Maps
            </a>
          )}
          {plan.stops.length > MAX_WAYPOINTS + 1 && (
            <p className="text-xs text-muted">Google Maps takes {MAX_WAYPOINTS + 1} stops per route: use each stop&apos;s Navigate for the rest.</p>
          )}
          <ol className="space-y-2">
            {plan.stops.map((s) => (
              <li key={s.n} className="flex items-center gap-3 rounded-[10px] border border-border bg-surface-solid p-3">
                <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${TONE[s.kind]}`}>{s.n}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-fg">{s.title}</span>
                  <span className="block truncate text-xs text-secondary">{s.address}</span>
                </span>
                <a href={s.navigate} target="_blank" rel="noopener" className="btn-ghost shrink-0 rounded-full px-3 py-1.5 text-xs">
                  Navigate
                </a>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted">🟠 pick up · 🔵 store · 🟢 deliver. Open this link again any time: it updates with every new job.</p>
        </>
      )}
    </main>
  );
}
