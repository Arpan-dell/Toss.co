"use client";

import { useEffect, useRef, useState } from "react";

// Charts for Toss AI. Colours were checked with the dataviz palette validator on the dark surface:
// actual = blue, forecast = orange (CVD ΔE 26.8); customer segments use five validated categorical
// slots in fixed order. Lines are 2px, grids hairline, text stays in text tokens, every chart has a
// hover readout, and multi-series charts have a legend.

export const VIZ = { actual: "#3987e5", forecast: "#d95926", seg: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"] };
const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 1 });
const tip = "pointer-events-none absolute z-20 whitespace-nowrap rounded-lg border border-border-strong bg-surface-solid/95 px-3 py-2 text-xs shadow-2xl backdrop-blur";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= v)!;
}

const short = (date: string) => new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

// ---------- forecast: actuals, forecast line and its 80% range ----------
export function ForecastChart({
  history,
  next,
  height = 260,
}: {
  history: { date: string; actual: number }[];
  next: { date: string; weekday: string; mid: number; lo: number; hi: number }[];
  height?: number;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const points = [...history.map((h) => ({ date: h.date, actual: h.actual })), ...next.map((n) => ({ date: n.date, mid: n.mid, lo: n.lo, hi: n.hi, weekday: n.weekday }))];
  const top = niceMax(Math.max(1, ...history.map((h) => h.actual), ...next.map((n) => n.hi)));
  const padL = 34;
  const padB = 22;
  const H = height - padB;
  const W = Math.max(w - padL, 10);
  const x = (i: number) => padL + (i / Math.max(points.length - 1, 1)) * W;
  const y = (v: number) => H - (v / top) * (H - 8);
  const split = history.length - 1;
  const line = (idx: number[], val: (i: number) => number) => idx.map((i, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(val(i)).toFixed(1)}`).join("");
  const hIdx = history.map((_, i) => i);
  const fIdx = [split, ...next.map((_, i) => history.length + i)];
  const fVal = (i: number) => (i === split ? history[split]?.actual ?? 0 : next[i - history.length].mid);
  const bandUp = next.map((n, i) => `${x(history.length + i).toFixed(1)},${y(n.hi).toFixed(1)}`);
  const bandDown = next.map((n, i) => `${x(history.length + i).toFixed(1)},${y(n.lo).toFixed(1)}`).reverse();
  const ticks = [0, top / 2, top];
  const p = hover !== null ? points[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-secondary">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded" style={{ background: VIZ.actual }} />Actual pickups</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded border-t-2 border-dashed" style={{ borderColor: VIZ.forecast }} />Forecast</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm" style={{ background: `${VIZ.forecast}33` }} />Likely range (80%)</span>
      </div>
      <div ref={ref} className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        {w > 0 && (
          <svg width={w} height={height} className="overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={w} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
                <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-[var(--text-muted)] text-[11px] tabular-nums">{fmt(t)}</text>
              </g>
            ))}
            <polygon points={[...bandUp, ...bandDown].join(" ")} fill={`${VIZ.forecast}2e`} />
            <line x1={x(split)} x2={x(split)} y1={0} y2={H} stroke="rgb(255 255 255 / 0.18)" />
            <text x={x(split) + 4} y={12} className="fill-[var(--text-muted)] text-[11px]">Today</text>
            <path d={line(hIdx, (i) => history[i].actual)} fill="none" stroke={VIZ.actual} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <path d={line(fIdx, fVal)} fill="none" stroke={VIZ.forecast} strokeWidth={2} strokeDasharray="6 4" strokeLinejoin="round" strokeLinecap="round" />
            {points.map((pt, i) =>
              i % 7 === 0 || i === points.length - 1 ? (
                <text key={pt.date} x={x(i)} y={height - 4} textAnchor="middle" className="fill-[var(--text-muted)] text-[11px]">{short(pt.date)}</text>
              ) : null,
            )}
            {hover !== null && p && (
              <>
                <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="rgb(255 255 255 / 0.35)" />
                <circle cx={x(hover)} cy={y("actual" in p && p.actual !== undefined ? p.actual : (p as { mid: number }).mid)} r={4.5} fill={"actual" in p && p.actual !== undefined ? VIZ.actual : VIZ.forecast} stroke="var(--surface-solid)" strokeWidth={2} />
              </>
            )}
            {points.map((pt, i) => (
              <rect key={`hit-${pt.date}`} x={x(i) - W / points.length / 2} y={0} width={W / points.length} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
            ))}
          </svg>
        )}
        {hover !== null && p && (
          <div className={tip} style={{ left: Math.min(Math.max(x(hover) - 70, 0), Math.max(w - 160, 0)), top: 4 }}>
            <p className="font-medium text-fg">{short(p.date)}{"weekday" in p ? ` · ${p.weekday}` : ""}</p>
            {"actual" in p && p.actual !== undefined ? (
              <p className="text-secondary tabular-nums">{p.actual} pickups</p>
            ) : (
              <>
                <p className="text-secondary tabular-nums">~{fmt((p as { mid: number }).mid)} pickups expected</p>
                <p className="text-muted tabular-nums">likely {fmt((p as { lo: number }).lo)}–{fmt((p as { hi: number }).hi)}</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- weekday × hour heatmap (one hue, brighter = more pickups) ----------
const ROWS = [1, 2, 3, 4, 5, 6, 0];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function Heatmap({ cells }: { cells: number[][] }) {
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const max = Math.max(1, ...cells.flat());
  const hourLabel = (h: number) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);
  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          {ROWS.map((d) => (
            <div key={d} className="flex items-center gap-[2px] py-[1px]">
              <span className="w-9 shrink-0 text-xs text-muted">{DAYS[d]}</span>
              {cells[d].map((v, h) => (
                <div
                  key={h}
                  onMouseEnter={() => setHover({ d, h })}
                  onMouseLeave={() => setHover(null)}
                  className="h-6 flex-1 rounded-[3px] transition-[outline] hover:outline hover:outline-2 hover:outline-white/60"
                  style={{ background: v ? `rgb(57 135 229 / ${0.12 + 0.88 * (v / max)})` : "rgb(255 255 255 / 0.03)" }}
                />
              ))}
            </div>
          ))}
          <div className="mt-1 flex gap-[2px] pl-9">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="flex-1 text-center text-[10px] text-muted">{h % 3 === 0 ? hourLabel(h) : ""}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted">
        Fewer
        <span className="h-2.5 w-28 rounded-full" style={{ background: "linear-gradient(to right, rgb(57 135 229 / 0.12), rgb(57 135 229 / 1))" }} />
        More pickups
        {hover && (
          <span className="ml-auto text-secondary">
            {DAYS[hover.d]} {hourLabel(hover.h)}–{hourLabel((hover.h + 1) % 24)}: <span className="text-fg tabular-nums">{cells[hover.d][hover.h]}</span> pickups (last 8 weeks)
          </span>
        )}
      </div>
    </div>
  );
}

// ---------- stacked segment bar with legend + direct labels ----------
export function SegmentBar({ segments }: { segments: { name: string; count: number; hint: string }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = segments.reduce((s, x) => s + x.count, 0);
  if (!total) return <p className="text-sm text-muted">No customers with orders yet.</p>;
  return (
    <div className="space-y-4">
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full">
        {segments.map((s, i) =>
          s.count ? (
            <div
              key={s.name}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className="h-full transition-opacity first:rounded-l-full last:rounded-r-full"
              style={{ width: `${(s.count / total) * 100}%`, background: VIZ.seg[i], opacity: hover === null || hover === i ? 1 : 0.35 }}
            />
          ) : null,
        )}
      </div>
      <ul className="grid gap-2 sm:grid-cols-5">
        {segments.map((s, i) => (
          <li
            key={s.name}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className={`rounded-xl border p-2.5 transition ${hover === i ? "border-border-strong bg-white/[0.05]" : "border-border bg-white/[0.02]"}`}
          >
            <p className="flex items-center gap-1.5 text-xs text-secondary">
              <span className="size-2.5 rounded-sm" style={{ background: VIZ.seg[i] }} />
              {s.name}
            </p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums">
              {s.count} <span className="text-xs font-normal text-muted">{Math.round((s.count / total) * 100)}%</span>
            </p>
            <p className="text-[11px] leading-snug text-muted">{s.hint}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- horizontal bars (single series) ----------
export function BarList({ rows, color = VIZ.actual }: { rows: { label: string; value: number; display: string; detail?: string }[]; color?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 tabular-nums text-secondary">{r.display}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-white/[0.04]">
            <div
              className="h-full rounded-full transition-[opacity,box-shadow]"
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color, opacity: hover === null || hover === i ? 1 : 0.4, boxShadow: hover === i ? `0 0 14px -2px ${color}` : "none" }}
            />
          </div>
          {hover === i && r.detail && <p className="mt-1 text-xs text-muted">{r.detail}</p>}
        </li>
      ))}
    </ul>
  );
}

// ---------- sparkline ----------
export function Sparkline({ values, labels, unit = "" }: { values: number[]; labels?: string[]; unit?: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const h = 44;
  const max = Math.max(1, ...values);
  const x = (i: number) => 3 + (i / Math.max(values.length - 1, 1)) * Math.max(w - 6, 1);
  const y = (v: number) => h - 4 - (v / max) * (h - 10);
  return (
    <div ref={ref} className="relative" style={{ height: h }} onMouseLeave={() => setHover(null)}>
      {w > 0 && (
        <svg width={w} height={h}>
          <path d={values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("")} fill="none" stroke={VIZ.actual} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {values.map((v, i) => (
            <rect key={i} x={x(i) - w / values.length / 2} y={0} width={w / values.length} height={h} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
          {hover !== null && <circle cx={x(hover)} cy={y(values[hover])} r={4} fill={VIZ.actual} stroke="var(--surface-solid)" strokeWidth={2} />}
        </svg>
      )}
      {hover !== null && (
        <div className={tip} style={{ left: Math.min(Math.max(x(hover) - 50, 0), Math.max(w - 120, 0)), bottom: h + 2 }}>
          {labels?.[hover] && <span className="text-muted">{labels[hover]} · </span>}
          <span className="tabular-nums text-fg">{unit}{fmt(values[hover])}</span>
        </div>
      )}
    </div>
  );
}
