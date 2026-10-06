"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion, useInView } from "framer-motion";
import { ArrowRight, Broadcast, ChartLineUp, Check, MapPinLine, Receipt, Robot, Truck, type Icon } from "@phosphor-icons/react";
import { MainCta } from "./main-cta";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { appHref } from "@/lib/hosts";
import type { PublicPlan } from "@/lib/data";

// "For laundry managers": the pitch on the left, a live product demo on the right. Each feature in the list
// has a scene on the demo board; the loop plays them in turn (hover or tap a feature to hold it). One screen
// tall on desktop. Only transforms and opacity animate, one scene is mounted at a time, and the loop stops
// off-screen. The board shows example data and says so.

const EASE = [0.16, 1, 0.3, 1] as const;
const SCENE_MS = 4200;

type Feature = { id: string; icon: Icon; title: string; tab: string; line: string };
const FEATURES: Feature[] = [
  {
    id: "board",
    icon: Broadcast,
    title: "Live dispatch board",
    tab: "Live board",
    line: "Every basket, order and driver, live. No refresh button.",
  },
  {
    id: "assign",
    icon: Truck,
    title: "Auto-assigned pickups",
    tab: "Dispatch",
    line: "The nearest free driver gets the job, with the route.",
  },
  {
    id: "ai",
    icon: Robot,
    title: "Toss AI, every morning",
    tab: "Toss AI",
    line: "Forecasts demand, wins back quiet customers, chases dues.",
  },
  {
    id: "analytics",
    icon: ChartLineUp,
    title: "Deep analytics",
    tab: "Analytics",
    line: "Revenue forecasts, busy hours, churn risk, driver ranks.",
  },
  {
    id: "invoice",
    icon: Receipt,
    title: "Invoices, automatically",
    tab: "Invoices",
    line: "Numbered PDF bills, emailed and sent on Telegram.",
  },
  {
    id: "directory",
    icon: MapPinLine,
    title: "Found by new customers",
    tab: "Directory",
    line: "Listed on Toss's directory for everyone nearby.",
  },
];

// ---------- the six scenes ----------

const ROWS = [
  { code: "C-4KX9", kg: "6.1", area: "Saket" },
  { code: "C-7QM2", kg: "4.8", area: "Malviya Nagar" },
  { code: "C-2HD5", kg: "5.5", area: "Hauz Khas" },
  { code: "C-9TR1", kg: "7.2", area: "Green Park" },
];
const STATES = [
  { label: "New pickup", cls: "bg-accent text-accent-contrast" },
  { label: "Driver en route", cls: "bg-info-bg text-info" },
  { label: "Picked up", cls: "bg-good-bg text-good" },
];

function BoardScene() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => Math.min(t + 1, 2)), 1100);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="grid grid-cols-3 gap-2.5">
        {[
          ["Active pickups", "12"],
          ["Drivers online", "5"],
          ["Today", "₹6,840"],
        ].map(([k, v], i) => (
          <motion.div
            key={k}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, ease: EASE, duration: 0.5 }}
            className="rounded-xl border border-border bg-bg/60 p-3"
          >
            <p className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">{k}</p>
            <p className="mt-1 text-xl font-bold text-fg tabular-nums">{v}</p>
          </motion.div>
        ))}
      </div>
      {ROWS.map((r, i) => {
        const s = i === 0 ? STATES[tick] : STATES[Math.min(2, i === 1 ? 1 : 2)];
        return (
          <motion.div
            key={r.code}
            initial={{
              opacity: 0,
              x: i === 0 ? 0 : 30,
              y: i === 0 ? -26 : 0,
              scale: i === 0 ? 1.04 : 1,
            }}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            transition={{ delay: 0.2 + i * 0.09, duration: 0.6, ease: EASE }}
            className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 ${i === 0 ? "border-accent/50 bg-accent/10" : "border-border bg-bg/60"}`}
          >
            <span className="shrink-0 font-mono text-xs whitespace-nowrap text-fg">{r.code}</span>
            <span className="min-w-0 truncate text-xs text-muted">{r.area}</span>
            <span className="ml-auto shrink-0 font-mono text-xs whitespace-nowrap text-secondary tabular-nums">{r.kg} kg</span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={s.label}
                initial={{ opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: EASE }}
                className={`shrink-0 rounded-[4px] px-2 py-0.5 font-mono text-[10px] tracking-[0.06em] whitespace-nowrap uppercase ${s.cls}`}
              >
                {s.label}
              </motion.span>
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

// map coordinates in a 560 x 300 box (about the scene's own proportions, so nothing is cropped); drivers sit
// above the bottom strip where the "assigned" card lands
const BASKET = { x: 320, y: 120 };
const DRIVERS = [
  { name: "Ravi", x: 440, y: 50, km: "1.2 km", near: true },
  { name: "Aman", x: 80, y: 120, km: "3.8 km" },
  { name: "Sonu", x: 200, y: 190, km: "4.1 km" },
];
function AssignScene() {
  const ravi = DRIVERS[0];
  // along the streets: down Ravi's road, then across to the basket
  const route = `M ${ravi.x} ${ravi.y} L ${ravi.x} ${BASKET.y} L ${BASKET.x} ${BASKET.y}`;
  return (
    <div className="relative h-full overflow-hidden rounded-xl border border-border bg-bg/60">
      <svg viewBox="0 0 560 300" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full">
        {/* streets */}
        {[50, 120, 190, 260].map((y) => (
          <line key={`h${y}`} x1="0" x2="560" y1={y} y2={y} stroke="rgb(var(--ink-rgb) / 0.08)" strokeWidth="6" />
        ))}
        {[80, 200, 320, 440].map((x) => (
          <line key={`v${x}`} y1="0" y2="300" x1={x} x2={x} stroke="rgb(var(--ink-rgb) / 0.08)" strokeWidth="6" />
        ))}
        {/* search radius */}
        <motion.circle
          cx={BASKET.x}
          cy={BASKET.y}
          r="150"
          fill="rgb(var(--accent-rgb) / 0.06)"
          stroke="rgb(var(--accent-rgb) / 0.35)"
          strokeDasharray="4 6"
          initial={{ scale: 0.2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.9, ease: EASE }}
          style={{ transformOrigin: `${BASKET.x}px ${BASKET.y}px` }}
        />
        {/* the route to the nearest driver */}
        <motion.path
          d={route}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.9, duration: 0.9, ease: [0.65, 0, 0.35, 1] }}
        />
        {DRIVERS.map((d, i) => (
          <motion.g
            key={d.name}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: d.near ? 1 : [1, 1, 0.35], scale: 1 }}
            transition={{
              delay: 0.3 + i * 0.1,
              duration: d.near ? 0.4 : 1.6,
              times: d.near ? undefined : [0, 0.6, 1],
            }}
            style={{ transformOrigin: `${d.x}px ${d.y}px` }}
          >
            <circle cx={d.x} cy={d.y} r="9" fill={d.near ? "var(--accent)" : "rgb(var(--ink-rgb) / 0.55)"} />
            <text x={d.x} y={d.y - 15} textAnchor="middle" className="font-mono" style={{ fontSize: 13, fill: "rgb(var(--ink-rgb) / 0.8)" }}>
              {d.name} · {d.km}
            </text>
          </motion.g>
        ))}
        <circle cx={BASKET.x} cy={BASKET.y} r="11" fill="var(--text)" />
        <circle
          cx={BASKET.x}
          cy={BASKET.y}
          r="11"
          fill="none"
          stroke="var(--text)"
          className="orbit-pulse"
          style={{ transformOrigin: `${BASKET.x}px ${BASKET.y}px` }}
        />
      </svg>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.7, duration: 0.5, ease: EASE }}
        className="absolute right-3 bottom-3 left-3 flex items-center gap-3 rounded-xl border border-accent/40 bg-surface-solid/95 px-3.5 py-2.5 shadow-lg"
      >
        <span className="grid size-8 place-items-center rounded-full bg-accent text-accent-contrast">
          <Truck size={16} weight="fill" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">Ravi got the pickup · 1.2 km away</p>
          <p className="text-xs text-muted">Assigned automatically in 2 s · route sent on Telegram</p>
        </div>
      </motion.div>
    </div>
  );
}

const AI_LINES = [
  "Win back 4 quiet customers: 10% offer sent",
  "Saturday runs hot (+28%): add one driver",
  "₹2,340 unpaid over 7 days: reminders sent",
];
function AiScene() {
  const C = 2 * Math.PI * 34;
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-4 rounded-xl border border-border bg-bg/60 p-4">
        <svg viewBox="0 0 80 80" className="size-20 shrink-0 -rotate-90">
          <circle cx="40" cy="40" r="34" fill="none" stroke="rgb(var(--ink-rgb) / 0.1)" strokeWidth="7" />
          <motion.circle
            cx="40"
            cy="40"
            r="34"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={C}
            initial={{ strokeDashoffset: C }}
            animate={{ strokeDashoffset: C * 0.18 }}
            transition={{ duration: 1.3, ease: EASE }}
          />
        </svg>
        <div>
          <p className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">Business health</p>
          <p className="text-3xl font-black text-fg">82</p>
          <p className="text-xs text-secondary">Morning briefing, written for you</p>
        </div>
      </div>
      {AI_LINES.map((l, i) => (
        <motion.div
          key={l}
          initial={{ opacity: 0, x: -24, filter: "blur(4px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          transition={{ delay: 0.5 + i * 0.35, duration: 0.5, ease: EASE }}
          className="flex items-center gap-3 rounded-xl border border-border bg-bg/60 px-3.5 py-3"
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-good-bg text-good">
            <Check size={13} weight="bold" />
          </span>
          <span className="text-sm text-fg">{l}</span>
        </motion.div>
      ))}
    </div>
  );
}

const BARS = [42, 55, 48, 63, 71, 96, 80];
const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
function AnalyticsScene() {
  const pts = BARS.map((v, i) => `${20 + i * 52},${150 - v * 1.15 - 12}`).join(" ");
  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-bg/60 p-4">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">Pickups this week</p>
        <p className="text-sm text-secondary">
          Forecast <span className="font-bold text-fg">₹18.4k</span>
        </p>
      </div>
      <div className="relative mt-3 flex-1">
        <svg viewBox="0 0 360 170" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          {BARS.map((v, i) => (
            <motion.rect
              key={i}
              x={6 + i * 52}
              width="28"
              y={150 - v * 1.15}
              height={v * 1.15}
              rx="5"
              fill={i === 5 ? "var(--accent)" : "rgb(var(--ink-rgb) / 0.18)"}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: 0.1 + i * 0.07, duration: 0.7, ease: EASE }}
              style={{ transformOrigin: `0 150px`, transformBox: "view-box" }}
            />
          ))}
          <motion.polyline
            points={pts}
            fill="none"
            stroke="var(--text)"
            strokeWidth="2"
            strokeDasharray="5 5"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.7 }}
            transition={{ delay: 0.8, duration: 1.1, ease: EASE }}
          />
          {DAYS.map((d, i) => (
            <text
              key={i}
              x={20 + i * 52}
              y="168"
              textAnchor="middle"
              className="font-mono"
              style={{ fontSize: 11, fill: "rgb(var(--ink-rgb) / 0.5)" }}
            >
              {d}
            </text>
          ))}
        </svg>
      </div>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.4, duration: 0.5 }}
        className="mt-3 text-sm text-secondary"
      >
        <span className="font-semibold text-accent">Saturday</span> is your busiest day. Staff before the rush, not during it.
      </motion.p>
    </div>
  );
}

function InvoiceScene() {
  return (
    <div className="relative grid h-full place-items-center pb-10">
      <motion.div
        initial={{ opacity: 0, y: 60, rotate: -4 }}
        animate={{ opacity: 1, y: 0, rotate: -2 }}
        transition={{ duration: 0.8, ease: EASE }}
        className="relative w-[78%] max-w-sm rounded-xl border border-border bg-surface-solid p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <p className="font-bold text-fg">Invoice</p>
          <p className="font-mono text-[11px] text-muted">TOSS-2026-000142</p>
        </div>
        <div className="mt-4 space-y-1.5 font-mono text-xs text-secondary">
          <p className="flex justify-between gap-3">
            <span>Wash &amp; fold · 6.1 kg × ₹50</span>
            <span>₹305</span>
          </p>
          <p className="flex justify-between gap-3">
            <span>Pickup</span>
            <span>₹0</span>
          </p>
          <p className="flex justify-between gap-3 border-t border-border pt-1.5 font-bold text-fg">
            <span>Total</span>
            <span>₹305</span>
          </p>
        </div>
        <motion.span
          initial={{ opacity: 0, scale: 2.4, rotate: -24 }}
          animate={{ opacity: 1, scale: 1, rotate: -12 }}
          transition={{
            delay: 0.9,
            type: "spring",
            stiffness: 420,
            damping: 16,
          }}
          className="absolute right-4 -bottom-11 rounded-md border-[3px] border-good bg-surface-solid px-3 py-1 font-mono text-lg font-black tracking-[0.12em] text-good"
        >
          PAID · UPI
        </motion.span>
      </motion.div>
      <div className="absolute bottom-0 left-0 flex gap-2">
        {["Emailed", "Sent on Telegram"].map((t, i) => (
          <motion.span
            key={t}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.4 + i * 0.15 }}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-bg/70 px-2.5 py-1 text-xs text-secondary"
          >
            <Check size={12} weight="bold" className="text-good" /> {t}
          </motion.span>
        ))}
      </div>
    </div>
  );
}

const SHOPS = [
  { name: "Fresh · 1.4 km · ₹50/kg", x: 64, y: 34, you: true },
  { name: "", x: 24, y: 62 },
  { name: "", x: 78, y: 70 },
  { name: "", x: 36, y: 26 },
];
function DirectoryScene() {
  return (
    <div className="relative h-full overflow-hidden rounded-xl border border-border bg-bg/60">
      {[1, 2, 3].map((k) => (
        <motion.span
          key={k}
          aria-hidden
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: k * 0.15, duration: 0.9, ease: EASE }}
          className="absolute top-1/2 left-1/2 rounded-full border border-ink/10"
          style={{
            width: `${k * 30}%`,
            aspectRatio: "1",
            translate: "-50% -50%",
          }}
        />
      ))}
      <span aria-hidden className="absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg" />
      <span className="absolute top-1/2 left-1/2 mt-3 -translate-x-1/2 font-mono text-[10px] tracking-[0.1em] text-muted uppercase">
        Customer in Saket
      </span>
      {SHOPS.map((s, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: s.you ? 1 : 0.5, scale: 1 }}
          transition={{
            delay: 0.5 + i * 0.12,
            type: "spring",
            stiffness: 300,
            damping: 18,
          }}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${s.x}%`, top: `${s.y}%` }}
        >
          <span className={`block size-3.5 rounded-full ${s.you ? "bg-accent shadow-[0_0_0_6px_rgb(var(--accent-rgb)/0.2)]" : "bg-ink/50"}`} />
          {s.you && (
            <motion.span
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1 }}
              className="absolute top-5 left-1/2 -translate-x-1/2 rounded-md bg-fg px-2 py-1 font-mono text-[10px] whitespace-nowrap text-bg"
            >
              {s.name}
            </motion.span>
          )}
        </motion.div>
      ))}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.5, duration: 0.5, ease: EASE }}
        className="absolute right-3 bottom-3 left-3 rounded-xl border border-accent/40 bg-surface-solid/95 px-3.5 py-2.5 text-sm text-fg shadow-lg"
      >
        <span className="font-semibold">You show up</span> <span className="text-secondary">when a customer near you searches.</span>
      </motion.div>
    </div>
  );
}

const SCENES: Record<string, () => React.ReactElement> = {
  board: BoardScene,
  assign: AssignScene,
  ai: AiScene,
  analytics: AnalyticsScene,
  invoice: InvoiceScene,
  directory: DirectoryScene,
};

// ---------- section ----------

export function ManagerPricing({ plan }: { plan: PublicPlan | null }) {
  const reduce = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const inView = useInView(root, { margin: "-20% 0px -20% 0px" });
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (reduce || held || !inView) return;
    const id = window.setTimeout(() => setActive((a) => (a + 1) % FEATURES.length), SCENE_MS);
    return () => window.clearTimeout(id);
  }, [reduce, held, inView, active]);

  const pick = (i: number) => {
    setActive(i);
    setHeld(true);
  };
  const Scene = SCENES[FEATURES[active].id];
  const perDay = plan && plan.monthlyPrice > 0 ? Math.ceil(plan.monthlyPrice / 30) : null;
  const best = plan ? Math.max(plan.discount3m, plan.discount6m, plan.discount12m) : 0;

  return (
    // reducedMotion="user": the scenes' own entrances also hold still for reduced-motion visitors
    <MotionConfig reducedMotion="user">
      {/* Four blocks. Desktop: pitch, feature list and price on the left, the board on the right. Phones read
          headline -> board -> price (the list is replaced by the board's own tabs), so the demo comes before
          the price instead of a long scroll below it. min-w-0 keeps long lines truncating, not widening. */}
      <div ref={root} className="grid gap-8 lg:grid-cols-2 lg:grid-rows-[auto_auto_auto] lg:gap-x-12 lg:gap-y-0" onMouseLeave={() => setHeld(false)}>
        <div className="order-1 min-w-0 lg:order-none lg:col-start-1 lg:row-start-1 lg:self-end">
          <motion.p
            initial={reduce ? false : { opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: EASE }}
            className="flex items-center gap-3 font-mono text-[11px] tracking-[0.18em] text-accent uppercase"
          >
            <span className="h-px w-8 bg-accent" /> For laundry managers
          </motion.p>
          <h2 className="mt-4 text-[clamp(2.1rem,3.6vw,3.3rem)] leading-[1] font-black tracking-[-0.04em] text-fg">
            {["Your", "whole", "laundry,"].map((w, i) => (
              <motion.span
                key={w}
                initial={reduce ? false : { opacity: 0, y: "0.5em", filter: "blur(8px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true }}
                transition={{ delay: 0.08 * i, duration: 0.7, ease: EASE }}
                className="mr-[0.22em] inline-block"
              >
                {w}
              </motion.span>
            ))}
            <motion.span
              initial={reduce ? false : { opacity: 0, y: "0.5em", filter: "blur(8px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true }}
              transition={{ delay: 0.3, duration: 0.7, ease: EASE }}
              className="block text-accent"
            >
              on autopilot.
            </motion.span>
          </h2>
          <p className="mt-3 max-w-[50ch] text-base leading-relaxed text-secondary">
            One subscription replaces the booking calendar, the dispatcher, the invoice clerk and the notebook of who owes what.
          </p>
        </div>

        {/* the features, which drive the demo (desktop) */}
        <div className="order-2 hidden min-w-0 lg:order-none lg:col-start-1 lg:row-start-2 lg:block">
          <ul className="mt-5 space-y-0.5" role="list">
            {FEATURES.map((f, i) => {
              const on = i === active;
              const I = f.icon;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => pick(i)}
                    onMouseEnter={() => pick(i)}
                    onFocus={() => pick(i)}
                    aria-pressed={on}
                    className={`relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2 text-left transition-colors ${on ? "bg-ink/[0.06]" : "hover:bg-ink/[0.03]"}`}
                  >
                    <span
                      className={`grid size-8 shrink-0 place-items-center rounded-lg transition-colors duration-300 ${on ? "bg-accent text-accent-contrast" : "bg-ink/[0.06] text-secondary"}`}
                    >
                      <I size={17} weight={on ? "fill" : "regular"} />
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-sm font-semibold transition-colors ${on ? "text-fg" : "text-secondary"}`}>{f.title}</span>
                      <span
                        className={`grid min-w-0 transition-[grid-template-rows,opacity] duration-500 ${on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                      >
                        <span className="block truncate overflow-hidden text-xs text-muted">{f.line}</span>
                      </span>
                    </span>
                    {on && !held && !reduce && inView && (
                      <motion.span
                        key={`bar-${active}`}
                        aria-hidden
                        className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-accent"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{
                          duration: SCENE_MS / 1000,
                          ease: "linear",
                        }}
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* the price: after the demo on phones */}
        <div className="order-4 min-w-0 lg:order-none lg:col-start-1 lg:row-start-3 lg:self-start">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4 border-t border-border pt-5 lg:mt-5">
            <div>
              {plan && plan.monthlyPrice > 0 ? (
                <>
                  <p className="text-4xl font-black tracking-tight text-fg tabular-nums">
                    ₹{plan.monthlyPrice.toLocaleString("en-IN")}
                    <span className="ml-1.5 text-base font-medium text-muted">/month</span>
                  </p>
                  <p className="mt-1 text-sm text-secondary">
                    That&apos;s <span className="font-semibold text-fg">₹{perDay} a day</span>
                    {plan.trialDays > 0 ? `, after ${plan.trialDays} days free` : ""}
                    {best > 0 ? ` · up to ${best}% off upfront` : ""}.
                  </p>
                </>
              ) : (
                <p className="text-2xl font-black tracking-tight text-fg">One simple monthly plan.</p>
              )}
              <p className="mt-1 text-xs text-muted">Paid month by month over UPI. 0% fee on your customers&apos; payments.</p>
            </div>
            <div className="w-fit">
              <MainCta
                href={appHref("/login?next=/app/register-business")}
                glow
                className="btn-primary rounded-full px-7 py-3.5 text-base font-semibold"
              >
                {plan && plan.trialDays > 0 ? "Start free trial" : "Get started"} <ArrowRight size={18} weight="bold" />
              </MainCta>
            </div>
          </div>
        </div>

        {/* the demo board: right column on desktop, straight after the headline on phones */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 40, rotateX: 8 }}
          whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.9, ease: EASE }}
          className="relative order-3 min-w-0 [perspective:1200px] lg:order-none lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-center"
        >
          <div aria-hidden className="pointer-events-none absolute -inset-10 -z-10 rounded-full bg-accent/15 blur-[90px]" />
          <div className="overflow-hidden rounded-2xl border border-border-strong bg-surface-solid shadow-[0_40px_90px_-40px_rgb(0_0_0/0.6)]">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <span className="size-2 animate-pulse rounded-full bg-good" aria-hidden />
              <span className="text-sm font-semibold text-fg">Fresh Laundry</span>
              <span className="hidden font-mono text-[10px] tracking-[0.12em] text-muted uppercase sm:inline">Manager dashboard</span>
              <span className="ml-auto font-mono text-[10px] tracking-[0.12em] text-muted uppercase">Example data</span>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-3 py-2 [scrollbar-width:none]">
              {FEATURES.map((f, i) => (
                <button
                  type="button"
                  key={f.id}
                  onClick={() => setActive(i)}
                  aria-pressed={i === active}
                  className={`relative shrink-0 rounded-md px-3 py-1.5 text-xs transition-colors hover:text-fg ${i === active ? "text-fg" : "text-muted"}`}
                >
                  {i === active && (
                    <motion.span
                      layoutId="mgr-tab"
                      className="absolute inset-0 rounded-md bg-ink/[0.07]"
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 32,
                      }}
                    />
                  )}
                  <span className="relative">{f.tab}</span>
                </button>
              ))}
            </div>
            <div className="relative h-[320px] p-3 sm:h-[340px] sm:p-4" aria-live="off">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={FEATURES[active].id}
                  initial={reduce ? false : { opacity: 0, y: 24, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduce ? undefined : { opacity: 0, y: -16, scale: 0.98 }}
                  transition={{ duration: 0.45, ease: EASE }}
                  className="h-full"
                >
                  <Scene />
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="border-t border-border px-4 py-3 lg:hidden">
              <p className="text-sm font-semibold text-fg">{FEATURES[active].title}</p>
              <p className="mt-0.5 text-xs text-muted">{FEATURES[active].line}</p>
            </div>
          </div>
        </motion.div>
      </div>
    </MotionConfig>
  );
}
