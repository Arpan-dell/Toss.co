import type { Metadata } from "next";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { ColumnChart } from "@/components/charts";
import { planGate } from "@/components/plan-gate";
import { Badge, Card, EmptyState, PageTitle, StatTile } from "@/components/ui";
import { geminiEnabled } from "@/lib/ai/gemini";
import { approveAiAction, dismissAiAction, updateAutopilot } from "@/lib/actions/ai";
import { getLatestAiRun, getTenantById, listAiActions, now } from "@/lib/data";
import { formatINR, timeAgo } from "@/lib/format";
import { requireRole } from "@/lib/session";
import type { AiAction } from "@/lib/types";
import { AskToss, PendingButton, RunNow } from "./parts";

export const metadata: Metadata = { title: "Toss AI" };

const KIND: Record<AiAction["type"], { icon: string; name: string }> = {
  driver_alert: { icon: "📈", name: "Staffing" },
  set_max_jobs: { icon: "🚚", name: "Staffing" },
  winback_offer: { icon: "🎁", name: "Win-back" },
  payment_reminder: { icon: "🧾", name: "Payments" },
  basket_nudge: { icon: "🧺", name: "Nudge" },
  price_change: { icon: "💹", name: "Pricing" },
};
const PRIORITY = { 1: { tone: "critical", label: "Today" }, 2: { tone: "warn", label: "This week" }, 3: { tone: "neutral", label: "Nice to have" } } as const;

function HealthRing({ score }: { score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = score >= 70 ? "var(--color-good)" : score >= 45 ? "var(--color-warn)" : "var(--color-critical)";
  return (
    <div className="relative size-36 shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-4xl font-semibold tabular-nums">{score}</p>
          <p className="text-[10px] tracking-[0.14em] text-muted uppercase">Health</p>
        </div>
      </div>
    </div>
  );
}

function Toggle({ name, label, hint, defaultChecked, big = false }: { name: string; label: string; hint: string; defaultChecked: boolean; big?: boolean }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-white/[0.02] p-3 transition hover:border-accent/40 ${big ? "sm:col-span-2" : ""}`}>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-white/10 transition peer-checked:bg-accent after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-accent/60" />
      <span>
        <span className={`block font-medium ${big ? "text-base" : "text-sm"}`}>{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}

export default async function TossAi() {
  const locked = await planGate();
  if (locked) return locked;
  const session = await requireRole("MANAGER");
  const [tenant, run, actions] = await Promise.all([getTenantById(session.tenantId), getLatestAiRun(session.tenantId!), listAiActions(session.tenantId!)]);
  if (!tenant) return <Card>This manager account isn&apos;t linked to a business.</Card>;
  const current = now();
  const r = run?.report;
  const queue = actions.filter((a) => a.status === "SUGGESTED").sort((a, b) => a.priority - b.priority);
  const log = actions.filter((a) => a.status !== "SUGGESTED").slice(0, 25);
  const ap = tenant.autopilot;
  const autoDone = log.filter((a) => a.auto && a.status === "EXECUTED").length;

  return (
    <div className="stagger space-y-6">
      <PageTitle kicker="Toss AI">Your laundry, on autopilot</PageTitle>

      {!geminiEnabled() && (
        <p className="rounded-xl border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn">
          Toss AI&apos;s language model isn&apos;t connected yet, so briefings come from the rules engine. Forecasts and actions work the same.
        </p>
      )}

      {/* ---------- briefing ---------- */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent/60 via-white/10 to-cyan-400/40 p-px shadow-[0_30px_80px_-30px_rgb(139_123_255/0.55)]">
        <div className="relative rounded-[calc(1.5rem-1px)] bg-surface-solid p-6 sm:p-8">
          <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-accent/20 blur-3xl" />
          {r ? (
            <div className="relative flex flex-col gap-6 md:flex-row md:items-center">
              <HealthRing score={r.health.score} />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Badge tone={r.by === "ai" ? "info" : "neutral"} icon={r.by === "ai" ? "✨" : "⚙"}>
                    {r.by === "ai" ? "Toss AI" : "Rules engine"}
                  </Badge>
                  <span>
                    {run!.trigger === "daily" ? "Morning briefing" : "Fresh analysis"} · {timeAgo(run!.createdAt, current)}
                  </span>
                  {ap.enabled && <Badge tone="good" icon="●" live>Autopilot on</Badge>}
                </div>
                <h2 className="text-2xl leading-tight font-semibold sm:text-3xl">{r.headline}</h2>
                <p className="max-w-3xl text-sm leading-relaxed text-secondary">{r.narrative}</p>
                <div className="pt-1">
                  <RunNow />
                </div>
              </div>
            </div>
          ) : (
            <div className="relative max-w-2xl space-y-4">
              <h2 className="text-2xl font-semibold sm:text-3xl">Meet Toss AI ✨</h2>
              <p className="text-sm leading-relaxed text-secondary">
                Every morning Toss AI studies your pickups, drivers, customers and payments. It forecasts busy days, alerts drivers, wins back customers
                who stop ordering, chases unpaid invoices and tunes your price. Turn on <span className="text-fg">Automate everything</span> and it acts for
                you, within limits you set.
              </p>
              <RunNow first />
            </div>
          )}
        </div>
      </section>

      {r && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          <StatTile label="Pickups (30d)" value={String(r.kpis.orders30)} hint={`${r.kpis.growthPct >= 0 ? "+" : ""}${r.kpis.growthPct}% vs before`} />
          <StatTile label="Revenue (30d)" value={formatINR(r.kpis.revenue30)} />
          <StatTile label="Collected" value={`${r.kpis.collectionPct}%`} hint={r.kpis.outstanding ? `${formatINR(r.kpis.outstanding)} due` : "All paid"} />
          <StatTile label="Avg pickup" value={`${r.kpis.avgPickupHrs} h`} />
          <StatTile label="Repeat customers" value={`${r.kpis.repeatPct}%`} />
          <StatTile label="Autopilot did" value={String(autoDone)} hint="recent actions" />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ---------- action queue ---------- */}
        <Card title={`Action plan (${queue.length})`} className="lg:col-span-3">
          {queue.length === 0 ? (
            <EmptyState>{r ? "Nothing needs doing right now. Toss AI checks again every morning." : "Run an analysis to get your first action plan."}</EmptyState>
          ) : (
            <ul className="space-y-3">
              {queue.map((a) => (
                <li key={a.id} data-reveal="row" className="rounded-2xl border border-border bg-white/[0.02] p-4 transition hover:border-accent/40">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span>
                          {KIND[a.type].icon} {KIND[a.type].name}
                        </span>
                        <Badge tone={PRIORITY[a.priority].tone}>{PRIORITY[a.priority].label}</Badge>
                      </p>
                      <p className="font-medium">{a.label}</p>
                      <p className="text-sm text-secondary">{a.reason}</p>
                      {a.message && <p className="text-xs text-muted italic">“{a.message}”</p>}
                      <p className="text-xs text-good">↗ {a.impact}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <form action={approveAiAction}>
                        <input type="hidden" name="id" value={a.id} />
                        <PendingButton pendingText="Doing…" className="btn-primary rounded-full px-4 py-1.5 text-sm font-medium">
                          Do it
                        </PendingButton>
                      </form>
                      <form action={dismissAiAction}>
                        <input type="hidden" name="id" value={a.id} />
                        <PendingButton pendingText="…" className="btn-ghost rounded-full px-3 py-1.5 text-sm text-muted">
                          Skip
                        </PendingButton>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---------- ask ---------- */}
        <Card title="Ask Toss AI" className="lg:col-span-2">
          <AskToss />
        </Card>
      </div>

      {r && (
        <div className="grid gap-6 lg:grid-cols-5">
          <Card title="Next 7 days" className="lg:col-span-3">
            <ColumnChart
              unit="pickups"
              data={r.forecast.map((d) => ({
                label: `${d.weekday} ${d.date.slice(8)}`,
                value: d.expectedOrders,
                detail: `${d.driversNeeded} driver(s) needed · ${d.driversConnected} connected`,
              }))}
            />
            <p className="mt-3 text-sm text-secondary">{r.forecastNote}</p>
          </Card>
          <Card title="Watch & grow" className="lg:col-span-2">
            <div className="space-y-4 text-sm">
              <div>
                <p className="mb-1.5 text-xs font-medium tracking-[0.12em] text-critical uppercase">Risks</p>
                {r.risks.length ? (
                  <ul className="space-y-1.5">{r.risks.map((x) => <li key={x} className="flex gap-2"><span className="text-critical">●</span>{x}</li>)}</ul>
                ) : (
                  <p className="text-muted">Nothing worrying.</p>
                )}
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium tracking-[0.12em] text-good uppercase">Opportunities</p>
                {r.opportunities.length ? (
                  <ul className="space-y-1.5">{r.opportunities.map((x) => <li key={x} className="flex gap-2"><span className="text-good">●</span>{x}</li>)}</ul>
                ) : (
                  <p className="text-muted">Keep going: more data brings sharper ideas.</p>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ---------- autopilot ---------- */}
      <Card title="Autopilot">
        <ActionForm action={updateAutopilot} submitLabel="Save autopilot" className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle
              name="enabled"
              big
              label="🚀 Automate everything"
              hint="Every morning Toss AI does the switched-on jobs below by itself and logs each one. Off: it only suggests, and you tap “Do it”."
              defaultChecked={ap.enabled}
            />
            <Toggle name="staffing" label="📈 Driver staffing" hint="Alert drivers before busy days; raise how many pickups each can carry." defaultChecked={ap.staffing} />
            <Toggle name="winback" label="🎁 Win-back offers" hint="Personal discounts for regulars who are overdue, in Toss Control." defaultChecked={ap.winback} />
            <Toggle name="nudges" label="🧾 Customer nudges" hint="Remind unpaid invoices (bot + email) and nearly-full baskets." defaultChecked={ap.nudges} />
            <Toggle name="pricing" label="💹 Pricing" hint="Move your price per kg with demand, only within your limits." defaultChecked={ap.pricing} />
          </div>
          <fieldset className="grid gap-3 sm:grid-cols-4">
            <legend className="mb-2 text-xs font-medium text-secondary">Guardrails: Toss AI never goes beyond these</legend>
            <Field label="Max discount (%)">
              <input name="maxDiscount" type="number" min={1} max={50} step={1} required defaultValue={ap.maxDiscount} className={fieldClass} />
            </Field>
            <Field label="Max price change per step (%)">
              <input name="priceStep" type="number" min={1} max={20} step={1} required defaultValue={ap.priceStepPct} className={fieldClass} />
            </Field>
            <Field label="Lowest price (₹/kg)">
              <input name="priceMin" type="number" min={1} step="1" defaultValue={ap.priceMin ?? ""} placeholder={String(Math.round(tenant.pricePerKg * 0.9))} className={fieldClass} />
            </Field>
            <Field label="Highest price (₹/kg)">
              <input name="priceMax" type="number" min={1} step="1" defaultValue={ap.priceMax ?? ""} placeholder={String(Math.round(tenant.pricePerKg * 1.2))} className={fieldClass} />
            </Field>
          </fieldset>
        </ActionForm>
      </Card>

      {/* ---------- activity ---------- */}
      <Card title="Activity">
        {log.length === 0 ? (
          <EmptyState>Everything Toss AI (or you) does from the action plan shows up here.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {log.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p>
                    {KIND[a.type].icon} {a.label}
                  </p>
                  {a.result && <p className="text-xs text-muted">{a.result}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted">
                  {a.status === "EXECUTED" && <Badge tone="good" icon="✓">{a.auto ? "Autopilot" : "You"}</Badge>}
                  {a.status === "FAILED" && <Badge tone="critical" icon="!">Failed</Badge>}
                  {a.status === "DISMISSED" && <Badge tone="neutral">Skipped</Badge>}
                  {a.decidedAt && <span>{timeAgo(a.decidedAt, current)}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
