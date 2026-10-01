import type { Metadata } from "next";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { BarList, ForecastChart, Heatmap, SegmentBar, Sparkline } from "@/components/ai-charts";
import { planGate } from "@/components/plan-gate";
import { Badge, Card, EmptyState, PageTitle } from "@/components/ui";
import { businessInsights } from "@/lib/ai/autopilot";
import { geminiEnabled } from "@/lib/ai/gemini";
import { SEGMENTS } from "@/lib/ai/insights";
import { approveAiAction, dismissAiAction, updateAutopilot } from "@/lib/actions/ai";
import { getLatestAiRun, getTenantById, listAiActions, listDrivers, now } from "@/lib/data";
import { formatINR, timeAgo } from "@/lib/format";
import { requireRole } from "@/lib/session";
import type { AiAction } from "@/lib/types";
import { AskToss, PendingButton, RunNow } from "./parts";
import { Simulator } from "./simulator";

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
const SEGMENT_HINT: Record<(typeof SEGMENTS)[number], string> = {
  Champions: "4+ orders, on their usual rhythm",
  Loyal: "Repeat customers, on rhythm",
  New: "First order in the last 30 days",
  "At risk": "1.5–3× later than their usual gap",
  Lost: "3× past their usual gap",
};
const SECTIONS = [
  ["briefing", "Briefing"],
  ["plan", "Action plan"],
  ["forecast", "Forecast"],
  ["customers", "Customers"],
  ["money", "Money"],
  ["operations", "Operations"],
  ["whatif", "What-if"],
  ["autopilot", "Autopilot"],
] as const;
const inr = (n: number) => formatINR(n);
const hour = (h: number) => (h === 0 || h === 24 ? "12 am" : h < 12 ? `${h} am` : h === 12 ? "12 pm" : `${h - 12} pm`);

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

/** "How it's calculated": every number on this page can be traced. */
function How({ children }: { children: React.ReactNode }) {
  return (
    <details className="group mt-4 text-xs text-muted">
      <summary className="cursor-pointer list-none select-none hover:text-secondary">
        <span className="mr-1 inline-block transition group-open:rotate-90">›</span>How it&apos;s calculated
      </summary>
      <div className="mt-2 space-y-1 border-l border-border pl-3 leading-relaxed">{children}</div>
    </details>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "critical" }) {
  const color = tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "critical" ? "text-critical" : "text-muted";
  return (
    <div className="glass glow-card rounded-2xl p-4">
      <p className="text-[11px] tracking-[0.12em] text-muted uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className={`mt-0.5 text-xs ${color}`}>{sub}</p>}
    </div>
  );
}

function SectionTitle({ id, kicker, children }: { id: string; kicker: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-24 pt-4">
      <p className="text-xs tracking-[0.16em] text-accent uppercase">{kicker}</p>
      <h2 className="text-xl font-semibold">{children}</h2>
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
  const tenantId = session.tenantId!;
  const [tenant, run, actions, ins, drivers] = await Promise.all([getTenantById(tenantId), getLatestAiRun(tenantId), listAiActions(tenantId), businessInsights(tenantId), listDrivers()]);
  if (!tenant) return <Card>This manager account isn&apos;t linked to a business.</Card>;
  const current = now();
  const r = run?.report;
  const queue = actions.filter((a) => a.status === "SUGGESTED").sort((a, b) => a.priority - b.priority);
  const log = actions.filter((a) => a.status !== "SUGGESTED").slice(0, 25);
  const ap = tenant.autopilot;
  const f = ins.forecast;
  const conf = { high: { tone: "good", text: "High confidence" }, medium: { tone: "warn", text: "Medium confidence" }, low: { tone: "critical", text: "Low data: early estimates" } }[ins.data.level] as { tone: "good" | "warn" | "critical"; text: string };
  const connected = drivers.filter((d) => d.telegramChatId).length;
  const atRisk = ins.customers.list.filter((c) => c.segment === "At risk" || c.segment === "Lost");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle kicker="Toss AI">Your laundry, on autopilot</PageTitle>
        <div className="flex flex-wrap items-center gap-2 pb-2 text-xs">
          <Badge tone={conf.tone} icon="●">{conf.text}</Badge>
          <span className="text-muted">
            {ins.data.orders.toLocaleString("en-IN")} pickups over {ins.data.days} days
          </span>
          <Badge tone={geminiEnabled() ? "info" : "neutral"} icon={geminiEnabled() ? "✨" : "⚙"}>
            {geminiEnabled() ? "Gemini AI" : "Rules engine"}
          </Badge>
        </div>
      </div>

      <nav className="sticky top-2 z-30 -mx-1 overflow-x-auto rounded-full border border-border bg-surface-solid/85 p-1 backdrop-blur">
        <ul className="flex min-w-max gap-1 text-sm">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="block rounded-full px-3.5 py-1.5 text-secondary transition hover:bg-white/[0.06] hover:text-fg">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* ---------- briefing ---------- */}
      <section id="briefing" className="relative scroll-mt-24 overflow-hidden rounded-3xl bg-gradient-to-br from-accent/60 via-white/10 to-cyan-400/40 p-px shadow-[0_30px_80px_-30px_rgb(139_123_255/0.55)]">
        <div className="relative rounded-[calc(1.5rem-1px)] bg-surface-solid p-6 sm:p-8">
          <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-accent/20 blur-3xl" />
          {r ? (
            <div className="relative flex flex-col gap-6 md:flex-row md:items-center">
              <HealthRing score={r.health.score} />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Badge tone={r.by === "ai" ? "info" : "neutral"} icon={r.by === "ai" ? "✨" : "⚙"}>
                    {r.by === "ai" ? `Written by Toss AI${r.model ? ` · ${r.model}` : ""}` : "Rules engine"}
                  </Badge>
                  <span>
                    {run!.trigger === "daily" ? "Morning briefing" : "Fresh analysis"} · {timeAgo(run!.createdAt, current)}
                  </span>
                  {ap.enabled && <Badge tone="good" icon="●" live>Autopilot on</Badge>}
                </div>
                <h2 className="text-2xl leading-tight font-semibold sm:text-3xl">{r.headline}</h2>
                <p className="max-w-3xl text-sm leading-relaxed text-secondary">{r.narrative}</p>
                {(r.risks.length > 0 || r.opportunities.length > 0) && (
                  <div className="grid gap-3 pt-1 sm:grid-cols-2">
                    <ul className="space-y-1.5 text-sm">
                      {r.risks.map((x) => (
                        <li key={x} className="flex gap-2"><span className="text-critical">▲</span><span className="text-secondary">{x}</span></li>
                      ))}
                    </ul>
                    <ul className="space-y-1.5 text-sm">
                      {r.opportunities.map((x) => (
                        <li key={x} className="flex gap-2"><span className="text-good">◆</span><span className="text-secondary">{x}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="pt-1">
                  <RunNow />
                </div>
              </div>
            </div>
          ) : (
            <div className="relative max-w-2xl space-y-4">
              <h2 className="text-2xl font-semibold sm:text-3xl">Meet Toss AI ✨</h2>
              <p className="text-sm leading-relaxed text-secondary">
                Toss AI studies your pickups, customers, drivers and payments: it forecasts demand (and measures its own accuracy), finds
                customers drifting away, tracks money stuck in unpaid invoices and acts for you within limits you set.
              </p>
              <RunNow first />
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="Next 30 days" value={inr(f.next30.revenue)} sub={`likely ${inr(f.next30.revenueLo)}–${inr(f.next30.revenueHi)}`} />
        <Metric
          label="Forecast accuracy"
          value={f.accuracyPct != null ? `${f.accuracyPct}%` : "—"}
          sub={f.coverage ? `${f.coverage.inside}/${f.coverage.of} recent days inside the range` : "Needs ~3 weeks of orders"}
          tone={f.accuracyPct == null ? undefined : f.accuracyPct >= 75 ? "good" : f.accuracyPct >= 55 ? "warn" : "critical"}
        />
        <Metric label="Revenue at risk / yr" value={inr(ins.customers.revenueAtRisk)} sub={`${ins.customers.segments["At risk"]} customer(s) drifting away`} tone={ins.customers.revenueAtRisk ? "warn" : "good"} />
        <Metric label="Cash in next 7 days" value={inr(ins.money.expectedIn7Days)} sub={`of ${inr(ins.money.outstanding)} unpaid`} />
      </div>

      {/* ---------- action plan + ask ---------- */}
      <SectionTitle id="plan" kicker="Do this next">Action plan</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-5">
        <Card title={`${queue.length} suggested action${queue.length === 1 ? "" : "s"}`} className="lg:col-span-3">
          {queue.length === 0 ? (
            <EmptyState>{r ? "Nothing needs doing right now. Toss AI checks again every morning." : "Run an analysis to get your first action plan."}</EmptyState>
          ) : (
            <ul className="space-y-3">
              {queue.map((a) => (
                <li key={a.id} data-reveal="row" className="rounded-2xl border border-border bg-white/[0.02] p-4 transition hover:border-accent/40">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span>{KIND[a.type].icon} {KIND[a.type].name}</span>
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
                        <PendingButton pendingText="Doing…" className="btn-primary rounded-full px-4 py-1.5 text-sm font-medium">Do it</PendingButton>
                      </form>
                      <form action={dismissAiAction}>
                        <input type="hidden" name="id" value={a.id} />
                        <PendingButton pendingText="…" className="btn-ghost rounded-full px-3 py-1.5 text-sm text-muted">Skip</PendingButton>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Ask Toss AI" className="lg:col-span-2">
          <AskToss />
        </Card>
      </div>

      {/* ---------- forecast ---------- */}
      <SectionTitle id="forecast" kicker="Demand">Forecast & busy hours</SectionTitle>
      <Card title="Pickups: last 4 weeks and next 2 weeks">
        <ForecastChart history={f.history} next={f.next} />
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-secondary">
          <span>Trend: <span className={f.trendPct >= 0 ? "text-good" : "text-critical"}>{f.trendPct >= 0 ? "+" : ""}{f.trendPct}% a week</span></span>
          <span>Next 30 days: <span className="text-fg tabular-nums">~{f.next30.orders} pickups</span></span>
          {f.accuracyPct != null && <span>Backtested accuracy: <span className="text-fg">{f.accuracyPct}%</span></span>}
        </div>
        <How>
          <p>Each weekday gets its own pattern (e.g. Saturdays vs Mondays) from the last 8 weeks. The overall level is smoothed day by day, plus the trend of the last 4 weeks (damped, so one good week doesn&apos;t run away).</p>
          <p>The shaded band is where 8 in 10 days should land, based on how far past forecasts missed. Accuracy is measured by hiding the last 14 days, forecasting them from the weeks before, and comparing: 100% minus the total error.</p>
        </How>
      </Card>
      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="When pickups happen (last 8 weeks)" className="lg:col-span-3">
          <Heatmap cells={ins.heatmap.cells} />
          {ins.heatmap.peak && (
            <p className="mt-3 text-sm text-secondary">
              Peak: <span className="text-fg">{ins.heatmap.peak.weekday} {hour(ins.heatmap.peak.from)}–{hour(ins.heatmap.peak.to)}</span>, {ins.heatmap.peak.share}% of all pickups in just 3 hours. Have drivers online then.
            </p>
          )}
        </Card>
        <Card title="Unusual days" className="lg:col-span-2">
          {ins.anomalies.length === 0 ? (
            <p className="text-sm text-muted">No unusual days in the last two weeks: demand stayed within its normal range for each weekday.</p>
          ) : (
            <ul className="space-y-3">
              {ins.anomalies.map((a) => (
                <li key={a.date} className="flex items-start gap-3">
                  <Badge tone={a.direction === "spike" ? "info" : "warn"} icon={a.direction === "spike" ? "▲" : "▼"}>{a.direction}</Badge>
                  <p className="text-sm text-secondary">
                    <span className="text-fg">{a.weekday} {a.date.slice(5)}</span>: {a.actual} pickups vs a usual {a.expected}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <How>
            <p>Each of the last 14 days is compared with the same weekday over the 8 weeks before, using the median and typical spread (robust to one-off outliers). Flagged when it&apos;s far outside that range and at least 3 pickups off.</p>
          </How>
        </Card>
      </div>

      {/* ---------- customers ---------- */}
      <SectionTitle id="customers" kicker="People">Customer intelligence</SectionTitle>
      <Card title="Segments">
        <SegmentBar segments={SEGMENTS.map((s) => ({ name: s, count: ins.customers.segments[s], hint: SEGMENT_HINT[s] }))} />
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-secondary">
          <span>Avg order: <span className="text-fg">{inr(ins.customers.avgOrderValue)}</span></span>
          <span>30-day retention: <span className="text-fg">{ins.customers.retention30 != null ? `${ins.customers.retention30}%` : "needs more customers"}</span></span>
        </div>
      </Card>
      <Card title="Who's drifting away">
        {atRisk.length === 0 ? (
          <EmptyState>Every repeat customer is on their usual rhythm. 🎉</EmptyState>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] tracking-[0.12em] text-muted uppercase">
                  <th className="px-5 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Segment</th>
                  <th className="px-3 py-2 text-right font-medium">Orders</th>
                  <th className="px-3 py-2 text-right font-medium">Last order</th>
                  <th className="px-3 py-2 text-right font-medium">Usually every</th>
                  <th className="px-3 py-2 font-medium">Churn risk</th>
                  <th className="px-5 py-2 text-right font-medium">Worth / year</th>
                </tr>
              </thead>
              <tbody>
                {atRisk.map((c) => (
                  <tr key={c.code} className="border-b border-border last:border-0 hover:bg-white/[0.03]">
                    <td className="px-5 py-2.5 font-mono text-xs">{c.code}</td>
                    <td className="px-3 py-2.5"><Badge tone={c.segment === "Lost" ? "critical" : "warn"}>{c.segment}</Badge></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.orders}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.sinceDays} d ago</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.usualGapDays ? `${c.usualGapDays} d` : "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-white/[0.06]">
                          <div className="h-full rounded-full" style={{ width: `${c.risk}%`, background: c.risk >= 75 ? "var(--color-critical)" : "var(--color-warn)" }} />
                        </div>
                        <span className="tabular-nums text-secondary">{c.risk}</span>
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{inr(c.value12m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <How>
          <p>Each customer is compared with <em>their own</em> rhythm: a weekly customer who&apos;s 2 weeks quiet is a bigger worry than a monthly one. Risk rises from ~50 at 1.5× their usual gap to ~99 at 3×.</p>
          <p>“Worth / year” is their average order × how often they usually order, over 12 months: what you keep if they stay.</p>
        </How>
      </Card>

      {/* ---------- money ---------- */}
      <SectionTitle id="money" kicker="Cash">Money</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="Unpaid invoices by age" className="lg:col-span-3">
          <BarList
            color="#d95926"
            rows={ins.money.aging.map((a) => ({ label: a.bucket, value: a.amount, display: `${inr(a.amount)} · ${a.count} invoice${a.count === 1 ? "" : "s"}` }))}
          />
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-secondary">
            <span>Collected (30d): <span className="text-fg">{ins.money.collectionPct}%</span></span>
            <span>Customers pay in: <span className="text-fg">{ins.money.medianDaysToPay != null ? `${ins.money.medianDaysToPay} days (median)` : "—"}</span></span>
            <span>Expected in 7 days: <span className="text-fg">{inr(ins.money.expectedIn7Days)}</span></span>
          </div>
          <How>
            <p>Age counts from pickup. “Expected in 7 days” uses your customers&apos; real payment speed: the share of past invoices paid within a week, applied to recent unpaid ones (old ones are much less likely).</p>
          </How>
        </Card>
        <Card title="Weekly revenue (8 weeks)" className="lg:col-span-2">
          <p className="text-2xl font-semibold tabular-nums">{inr(ins.money.weeklyRevenue[ins.money.weeklyRevenue.length - 1]?.revenue ?? 0)}</p>
          <p className="mb-2 text-xs text-muted">last 7 days</p>
          <Sparkline values={ins.money.weeklyRevenue.map((w) => w.revenue)} labels={ins.money.weeklyRevenue.map((w) => `Week of ${w.week}`)} unit="₹" />
        </Card>
      </div>

      {/* ---------- operations ---------- */}
      <SectionTitle id="operations" kicker="Ground game">Areas & drivers</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Top areas (30 days)">
          {ins.areas.length === 0 ? (
            <EmptyState>Label your baskets on the Fleet page to see areas.</EmptyState>
          ) : (
            <BarList
              rows={ins.areas.map((a) => ({
                label: a.area,
                value: a.orders,
                display: `${a.orders} · ${a.share}%${a.growthPct != null ? ` · ${a.growthPct >= 0 ? "+" : ""}${a.growthPct}%` : ""}`,
                detail: `${inr(a.revenue)} revenue in the last 30 days${a.growthPct != null ? `, ${a.growthPct >= 0 ? "up" : "down"} ${Math.abs(a.growthPct)}% on the 30 days before` : ""}`,
              }))}
            />
          )}
        </Card>
        <Card title="Driver performance (30 days)">
          {ins.drivers.length === 0 ? (
            <EmptyState>Connect drivers to Toss Handy to track performance.</EmptyState>
          ) : (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[460px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] tracking-[0.12em] text-muted uppercase">
                    <th className="px-5 py-2 font-medium">Driver</th>
                    <th className="px-3 py-2 text-right font-medium">Pickups</th>
                    <th className="px-3 py-2 text-right font-medium">Typical time</th>
                    <th className="px-3 py-2 text-right font-medium">Within 2 h</th>
                    <th className="px-5 py-2 text-right font-medium">Passed on</th>
                  </tr>
                </thead>
                <tbody>
                  {ins.drivers.map((d, i) => (
                    <tr key={d.name} className="border-b border-border last:border-0">
                      <td className="px-5 py-2.5">{i === 0 && d.pickups > 0 ? "🏆 " : ""}{d.name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{d.pickups}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{d.medianMins != null ? `${d.medianMins} min` : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{d.onTimePct != null ? `${d.onTimePct}%` : "—"}</td>
                      <td className={`px-5 py-2.5 text-right tabular-nums ${d.declines ? "text-warn" : ""}`}>{d.declines}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <How>
            <p>Typical time is the median from assignment to “Picked up”. “Passed on” counts pickups the driver declined with “Can&apos;t take it”.</p>
          </How>
        </Card>
      </div>

      {/* ---------- what-if ---------- */}
      <SectionTitle id="whatif" kicker="Plan ahead">What-if simulator</SectionTitle>
      <Card>
        <Simulator
          base={{
            orders30: f.next30.orders,
            revenue30: f.next30.revenue,
            aov: ins.customers.avgOrderValue,
            price: tenant.pricePerKg,
            atRiskCustomers: ins.customers.segments["At risk"],
            atRiskYearly: ins.customers.revenueAtRisk,
            outstanding: ins.money.outstanding,
            connected,
            peaks: f.next.map((d) => d.mid),
          }}
        />
      </Card>

      {/* ---------- autopilot ---------- */}
      <SectionTitle id="autopilot" kicker="Hands-free">Autopilot</SectionTitle>
      <Card>
        <ActionForm action={updateAutopilot} submitLabel="Save autopilot" className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle name="enabled" big label="🚀 Automate everything" hint="Every morning Toss AI does the switched-on jobs below by itself and logs each one. Off: it only suggests, and you tap “Do it”." defaultChecked={ap.enabled} />
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
      <Card title="Activity">
        {log.length === 0 ? (
          <EmptyState>Everything Toss AI (or you) does from the action plan shows up here.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {log.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p>{KIND[a.type].icon} {a.label}</p>
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
