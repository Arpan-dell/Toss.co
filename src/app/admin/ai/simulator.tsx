"use client";

import { useState } from "react";

// What-if simulator. Plain arithmetic on the business's own forecast; every assumption is a visible
// control, so the manager can see exactly where a number comes from.

export interface SimBase {
  orders30: number; // forecast pickups, next 30 days
  revenue30: number; // forecast revenue, next 30 days
  aov: number; // average order value
  price: number; // current ₹/kg
  atRiskCustomers: number;
  atRiskYearly: number; // ₹ a year from at-risk customers if they keep their rhythm
  outstanding: number;
  connected: number; // drivers connected to Toss Handy
  peaks: number[]; // forecast pickups per day, next 14 days
}

const SENSITIVITY = {
  low: { label: "Low", e: -0.3, hint: "Few customers compare prices" },
  medium: { label: "Medium", e: -0.7, hint: "Typical for local services" },
  high: { label: "High", e: -1.2, hint: "Many cheaper options nearby" },
} as const;
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const PER_DRIVER = 8;

function Slider({ label, value, min, max, step = 1, suffix, onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix: string; onChange: (v: number) => void }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex justify-between text-xs">
        <span className="text-secondary">{label}</span>
        <span className="font-medium tabular-nums text-fg">
          {value > 0 && min < 0 ? "+" : ""}
          {value}
          {suffix}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--color-accent)]" />
    </label>
  );
}

export function Simulator({ base }: { base: SimBase }) {
  const [price, setPrice] = useState(0);
  const [sens, setSens] = useState<keyof typeof SENSITIVITY>("medium");
  const [winback, setWinback] = useState(30);
  const [discount, setDiscount] = useState(10);
  const [collect, setCollect] = useState(50);
  const [extraDrivers, setExtraDrivers] = useState(0);

  const e = SENSITIVITY[sens].e;
  const orderFactor = Math.max(0, 1 + e * (price / 100));
  const priceRevenue = base.revenue30 * orderFactor * (1 + price / 100);
  const priceDelta = priceRevenue - base.revenue30;
  const wonCustomers = Math.round((base.atRiskCustomers * winback) / 100);
  const winbackGain = (base.atRiskYearly / 12) * (winback / 100);
  const winbackCost = wonCustomers * base.aov * (discount / 100);
  const winbackDelta = winbackGain - winbackCost;
  const cash = (base.outstanding * collect) / 100;
  const total = priceRevenue + winbackDelta;
  const delta = total - base.revenue30;
  const drivers = base.connected + extraDrivers;
  const busy = base.peaks.filter((p) => p > 0);
  const covered = busy.filter((p) => Math.ceil(p / PER_DRIVER) <= drivers).length;

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-5 lg:col-span-3">
        <div className="space-y-3 rounded-2xl border border-border bg-white/[0.02] p-4">
          <p className="text-sm font-medium">💹 Change your price</p>
          <Slider label={`Price per kg (now ₹${base.price})`} value={price} min={-20} max={20} suffix="%" onChange={setPrice} />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted">How price-sensitive are your customers?</span>
            {(Object.keys(SENSITIVITY) as (keyof typeof SENSITIVITY)[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSens(k)}
                title={SENSITIVITY[k].hint}
                className={`rounded-full border px-3 py-1 transition ${sens === k ? "border-accent/60 bg-accent/15 text-fg" : "border-border text-secondary hover:text-fg"}`}
              >
                {SENSITIVITY[k].label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">
            New price ₹{Math.round(base.price * (1 + price / 100))}/kg · pickups {orderFactor >= 1 ? "+" : ""}
            {Math.round((orderFactor - 1) * 100)}% (assumption: {SENSITIVITY[sens].hint.toLowerCase()})
          </p>
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-white/[0.02] p-4">
          <p className="text-sm font-medium">🎁 Win back at-risk customers ({base.atRiskCustomers})</p>
          <Slider label="Share you win back" value={winback} min={0} max={100} step={5} suffix="%" onChange={setWinback} />
          <Slider label="Discount on their comeback pickup" value={discount} min={0} max={30} suffix="%" onChange={setDiscount} />
          <p className="text-xs text-muted">
            {wonCustomers} customer(s) back · +{inr(winbackGain)} a month at their usual rhythm, minus {inr(winbackCost)} in discounts
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-border bg-white/[0.02] p-4">
            <p className="text-sm font-medium">🧾 Collect unpaid invoices</p>
            <Slider label={`Of ${inr(base.outstanding)} outstanding`} value={collect} min={0} max={100} step={5} suffix="%" onChange={setCollect} />
          </div>
          <div className="space-y-3 rounded-2xl border border-border bg-white/[0.02] p-4">
            <p className="text-sm font-medium">🚚 Add drivers</p>
            <Slider label={`Now ${base.connected} connected`} value={extraDrivers} min={0} max={5} suffix="" onChange={setExtraDrivers} />
          </div>
        </div>
      </div>

      <div className="lg:col-span-2">
        <div className="sticky top-24 space-y-4 rounded-3xl border border-accent/30 bg-gradient-to-b from-accent/10 to-transparent p-5">
          <div>
            <p className="text-xs tracking-[0.14em] text-muted uppercase">Next 30 days, projected</p>
            <p className="mt-1 text-4xl font-semibold tabular-nums">{inr(total)}</p>
            <p className={`text-sm tabular-nums ${delta >= 0 ? "text-good" : "text-critical"}`}>
              {delta >= 0 ? "▲" : "▼"} {inr(Math.abs(delta))} ({base.revenue30 ? `${delta >= 0 ? "+" : "−"}${Math.abs(Math.round((delta / base.revenue30) * 100))}%` : "—"}) vs forecast {inr(base.revenue30)}
            </p>
          </div>
          <dl className="space-y-2 border-t border-border pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-secondary">From price change</dt><dd className="tabular-nums">{priceDelta >= 0 ? "+" : "−"}{inr(Math.abs(priceDelta))}</dd></div>
            <div className="flex justify-between"><dt className="text-secondary">From win-backs</dt><dd className="tabular-nums">{winbackDelta >= 0 ? "+" : "−"}{inr(Math.abs(winbackDelta))}</dd></div>
            <div className="flex justify-between"><dt className="text-secondary">One-time cash collected</dt><dd className="tabular-nums">+{inr(cash)}</dd></div>
            <div className="flex justify-between">
              <dt className="text-secondary">Busy days fully staffed</dt>
              <dd className={`tabular-nums ${covered === busy.length ? "text-good" : "text-warn"}`}>{busy.length ? `${covered} of ${busy.length}` : "—"}</dd>
            </div>
          </dl>
          <p className="text-[11px] leading-snug text-muted">
            Based on your forecast ({base.orders30} pickups, avg {inr(base.aov)} each). A driver handles about {PER_DRIVER} pickups a day. These are estimates, not promises: the sliders are your assumptions.
          </p>
        </div>
      </div>
    </div>
  );
}
