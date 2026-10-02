"use client";

import { useEffect, useRef, useState } from "react";

// Lightweight single-series charts following the dataviz mark specs:
// columns ≤24px with 4px rounded caps, 2px lines, ≥8px ringed markers,
// hairline grid, hover tooltips, text in text tokens (never series color).

function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 1 });

interface Datum {
  label: string;
  value: number;
  detail?: string;
}

export function ColumnChart({ data, unit, height = 220 }: { data: Datum[]; unit: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const ticks = niceTicks(Math.max(...data.map((d) => d.value)));
  const top = Math.max(ticks[ticks.length - 1], 1); // avoid divide-by-zero when every value is 0
  const maxIdx = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);

  return (
    <div className="flex gap-2" style={{ height }}>
      <div className="relative w-10 shrink-0 text-right text-xs tabular-nums text-muted" style={{ height: height - 24 }}>
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / top) * 100}%` }}>
            {fmt(t)}
          </span>
        ))}
      </div>
      <div className="relative flex-1">
        <div className="absolute inset-x-0 top-0" style={{ height: height - 24 }}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 h-px bg-[var(--grid)]" style={{ top: `${100 - (t / top) * 100}%` }} />
          ))}
        </div>
        <div className="relative flex h-full">
          {data.map((d, i) => (
            <div
              key={d.label}
              className="relative flex flex-1 flex-col items-center"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="relative flex w-full flex-1 items-end justify-center">
                {(i === maxIdx || hover === i) && (
                  <span
                    className="absolute text-xs font-medium tabular-nums text-fg"
                    style={{ bottom: `calc(${(d.value / top) * 100}% + 4px)` }}
                  >
                    {fmt(d.value)}
                  </span>
                )}
                <div
                  className="grow-y w-full max-w-6 rounded-t-[2px] transition-opacity duration-300"
                  style={{
                    height: `${(d.value / top) * 100}%`,
                    background: "var(--series-1)",
                    opacity: hover === null || hover === i ? 1 : 0.4,
                    animationDelay: `${i * 70}ms`,
                  }}
                />
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-6 whitespace-nowrap rounded-[6px] border border-border-strong bg-surface-solid px-3 py-2 text-xs shadow-xl">
                    <p className="font-medium text-fg">{d.label}</p>
                    <p className="tabular-nums text-secondary">
                      {fmt(d.value)} {unit}
                    </p>
                    {d.detail && <p className="text-muted">{d.detail}</p>}
                  </div>
                )}
              </div>
              <span className="mt-1 h-5 text-xs text-muted">{d.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LineChart({ data, unit, height = 220 }: { data: Datum[]; unit: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 44, r: 16, t: 12, b: 24 };
  const ticks = niceTicks(Math.max(...data.map((d) => d.value)));
  const top = Math.max(ticks[ticks.length - 1], 1); // avoid divide-by-zero when every value is 0
  const w = Math.max(0, width - pad.l - pad.r);
  const h = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (data.length > 1 ? (i / (data.length - 1)) * w : w / 2);
  const y = (v: number) => pad.t + h - (v / top) * h;
  const path = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`).join(" ");
  const area = `${path} L${x(data.length - 1)},${pad.t + h} L${x(0)},${pad.t + h} Z`;
  const last = data.length - 1;
  const labelEvery = Math.ceil(data.length / 6);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - pad.l;
    const i = Math.round((px / w) * (data.length - 1));
    setHover(Math.max(0, Math.min(last, i)));
  }

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`Line chart of ${unit}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[var(--text-muted)] text-xs tabular-nums">
                {fmt(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) =>
            i % labelEvery === 0 || i === last ? (
              <text key={d.label} x={x(i)} y={height - 6} textAnchor="middle" className="fill-[var(--text-muted)] text-xs">
                {d.label}
              </text>
            ) : null,
          )}
          <defs>
            <linearGradient id="line-wash" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#line-wash)" className="fade-in-late" />
          <path
            d={path}
            pathLength={1}
            className="draw-line"
            fill="none"
            stroke="var(--series-1)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ filter: "drop-shadow(0 0 6px rgb(144 133 233 / 0.6))" }}
          />
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + h} stroke="var(--text-muted)" strokeWidth={1} />
          )}
          {[hover ?? last].map((i) => (
            <circle key={i} cx={x(i)} cy={y(data[i].value)} r={4.5} fill="var(--series-1)" stroke="var(--bg)" strokeWidth={2} className="fade-in-late" />
          ))}
          {hover === null && (
            <text x={x(last) - 8} y={y(data[last].value) - 10} textAnchor="end" className="fade-in-late fill-[var(--text)] text-xs font-medium tabular-nums">
              {fmt(data[last].value)} {unit}
            </text>
          )}
        </svg>
      )}
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-lg border border-border-strong bg-surface-solid/95 px-3 py-2 text-xs shadow-2xl backdrop-blur"
          style={{ left: Math.min(x(hover) + 12, width - 150) }}
        >
          <p className="font-medium text-fg">{data[hover].label}</p>
          <p className="tabular-nums text-secondary">
            {fmt(data[hover].value)} {unit}
          </p>
          {data[hover].detail && <p className="text-muted">{data[hover].detail}</p>}
        </div>
      )}
    </div>
  );
}
