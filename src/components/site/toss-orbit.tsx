"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Basket, TelegramLogo, Truck, UsersThree, type Icon } from "@phosphor-icons/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

// "Everything is connected": four rings of text orbit the Toss core, one for each part of the system (the
// basket, the Toss Control bot, the Toss Handy bot, the accounts). A loop walks through one pickup; the ring
// whose turn it is lights up, and a signal travels to it from the previous one, through the core. Hover or tap a
// node to stop on it. Rings spin in CSS (compositor only) and pause off-screen; reduced motion holds everything
// still and leaves the nodes clickable.

const VB = 640;
const C = VB / 2;

type Ring = { id: string; name: string; r: number; angle: number; spin: number; reverse?: boolean; text: string; icon: Icon; title: string; body: string };

const RINGS: Ring[] = [
  {
    id: "basket",
    name: "Basket",
    r: 112,
    angle: 214,
    spin: 40,
    text: "TOSS BASKET · WEIGHS ITSELF · TARE · 6.0 KG TARGET · FULL · ",
    icon: Basket,
    title: "The basket weighs itself",
    body: "Clothes go in, the scale under the false plate reads 5.8 of 6 kg. Full, so it books the pickup on its own.",
  },
  {
    id: "control",
    name: "Toss Control",
    r: 168,
    angle: 326,
    spin: 56,
    reverse: true,
    text: "TOSS CONTROL · TELEGRAM · LIVE WEIGHT · PICKUP BOOKED · ",
    icon: TelegramLogo,
    title: "Toss Control tells you",
    body: "The customer bot pings you on Telegram: pickup booked. Check the live weight or tare the basket from your phone.",
  },
  {
    id: "handy",
    name: "Toss Handy",
    r: 224,
    angle: 138,
    spin: 72,
    text: "TOSS HANDY · DRIVER BOT · NEAREST DRIVER · ROUTE · WEIGH-IN · ",
    icon: Truck,
    title: "Toss Handy sends a driver",
    body: "The driver bot offers the job to the nearest free driver, with the route, and they confirm the weight at pickup.",
  },
  {
    id: "accounts",
    name: "Accounts",
    r: 280,
    angle: 38,
    spin: 90,
    reverse: true,
    text: "ACCOUNTS · CUSTOMER · LAUNDRY · OWNER · UPI INVOICE · LIVE BOARD · ",
    icon: UsersThree,
    title: "Every account sees it live",
    body: "Your account, the laundry's live board and the owner's dashboard update together, and the bill lands in your account to pay by UPI.",
  },
];

const STEP_MS = 3400;

const rad = (deg: number) => (deg * Math.PI) / 180;
const nodeAt = (ring: Ring) => [C + ring.r * Math.cos(rad(ring.angle)), C + ring.r * Math.sin(rad(ring.angle))] as const;
const circlePath = (r: number) => `M ${C - r} ${C} a ${r} ${r} 0 1 1 ${2 * r} 0 a ${r} ${r} 0 1 1 ${-2 * r} 0`;
// how many copies of the label fill a ring at roughly 10.5 user units per monospace character
const copies = (ring: Ring) => Math.max(1, Math.round((2 * Math.PI * ring.r) / (ring.text.length * 10.5)));

export function TossOrbit({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [held, setHeld] = useState(false);
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduce || held || !onScreen) return;
    const id = window.setInterval(() => setStep((s) => (s + 1) % RINGS.length), STEP_MS);
    return () => window.clearInterval(id);
  }, [reduce, held, onScreen]);

  const active = RINGS[step];
  const prev = RINGS[(step + RINGS.length - 1) % RINGS.length];
  const [x1, y1] = nodeAt(prev);
  const [x2, y2] = nodeAt(active);
  // the signal bends through the core: every hand-off goes through Toss
  const signal = `M ${x1} ${y1} Q ${C} ${C} ${x2} ${y2}`;

  return (
    <div className={className}>
      <div
        ref={box}
        role="group"
        aria-label="How the basket, the two Telegram bots and the accounts connect"
        data-paused={!onScreen || undefined}
        className="relative mx-auto aspect-square w-full max-w-[640px] select-none"
        onMouseLeave={() => setHeld(false)}
      >
        {/* rings of text, each on its own layer so the rotation stays on the compositor */}
        {RINGS.map((ring) => {
          const on = ring.id === active.id;
          return (
            <div
              key={ring.id}
              aria-hidden
              className="orbit-ring absolute inset-0"
              style={{ "--orbit-dur": `${ring.spin}s`, "--orbit-dir": ring.reverse ? "reverse" : "normal" } as React.CSSProperties}
            >
              <svg viewBox={`0 0 ${VB} ${VB}`} className="h-full w-full overflow-visible">
                <defs>
                  <path id={`orbit-${ring.id}`} d={circlePath(ring.r)} />
                </defs>
                <circle cx={C} cy={C} r={ring.r} fill="none" stroke="rgb(var(--ink-rgb) / 0.08)" strokeDasharray="2 6" />
                <text
                  className="font-mono font-semibold tracking-[0.18em] transition-[fill] duration-700"
                  style={{ fontSize: 13, fill: on ? "var(--accent)" : "rgb(var(--ink-rgb) / 0.3)" }}
                >
                  <textPath href={`#orbit-${ring.id}`} textLength={2 * Math.PI * ring.r - 4} lengthAdjust="spacing">
                    {ring.text.repeat(copies(ring))}
                  </textPath>
                </text>
              </svg>
            </div>
          );
        })}

        {/* the hand-off: a line from the last part to the active one, and a pulse riding it */}
        <svg viewBox={`0 0 ${VB} ${VB}`} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          <defs>
            <radialGradient id="orbit-core-glow">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={C} cy={C} r={92} fill="url(#orbit-core-glow)" />
          {RINGS.map((ring) => {
            const [x, y] = nodeAt(ring);
            return <line key={ring.id} x1={C} y1={C} x2={x} y2={y} stroke="rgb(var(--ink-rgb) / 0.07)" strokeWidth={1} />;
          })}
          <motion.path
            key={`signal-${step}`}
            d={signal}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinecap="round"
            initial={reduce ? false : { pathLength: 0, opacity: 0.9 }}
            animate={{ pathLength: 1, opacity: 0.9 }}
            transition={{ duration: 1.1, ease: [0.65, 0, 0.35, 1] }}
          />
          {!reduce && (
            <circle key={`pulse-${step}`} r={6} fill="var(--accent)">
              <animateMotion dur="1.1s" fill="freeze" path={signal} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.65 0 0.35 1" />
            </circle>
          )}
        </svg>

        {/* the core */}
        <div aria-hidden className="absolute top-1/2 left-1/2 grid size-[17%] -translate-x-1/2 -translate-y-1/2 place-items-center">
          <span className="orbit-pulse absolute inset-0 rounded-full border border-accent/50" />
          <span className="orbit-pulse absolute inset-0 rounded-full border border-accent/40 [animation-delay:1.2s]" />
          <Image src="/icon.png" alt="" width={96} height={96} className="relative size-[78%] rounded-[24%] shadow-[0_0_40px_rgb(var(--accent-rgb)/0.45)]" />
        </div>

        {/* the parts, as buttons */}
        {RINGS.map((ring, i) => {
          const [x, y] = nodeAt(ring);
          const on = i === step;
          const Glyph = ring.icon;
          return (
            <button
              key={ring.id}
              type="button"
              onClick={() => {
                setStep(i);
                setHeld(true);
              }}
              onMouseEnter={() => {
                setStep(i);
                setHeld(true);
              }}
              onFocus={() => {
                setStep(i);
                setHeld(true);
              }}
              onBlur={() => setHeld(false)}
              aria-pressed={on}
              aria-label={ring.name}
              className="group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 outline-none"
              style={{ left: `${(x / VB) * 100}%`, top: `${(y / VB) * 100}%` }}
            >
              <span
                className={`grid size-11 place-items-center rounded-full border transition-all duration-500 group-focus-visible:ring-2 group-focus-visible:ring-accent sm:size-12 ${
                  on ? "scale-110 border-accent bg-accent text-accent-contrast shadow-[0_0_30px_rgb(var(--accent-rgb)/0.55)]" : "border-border-strong bg-surface-solid text-fg"
                }`}
              >
                <Glyph size={20} weight={on ? "fill" : "regular"} />
              </span>
              <span className={`rounded-[4px] px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] whitespace-nowrap uppercase transition-colors sm:text-[11px] ${on ? "bg-fg text-bg" : "bg-surface-solid/80 text-secondary"}`}>
                {ring.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* what's happening right now */}
      <div className="mx-auto mt-2 max-w-md px-2 sm:mt-4">
        <div className="flex items-center gap-3 font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
          <span className="text-accent">
            {String(step + 1).padStart(2, "0")} / {String(RINGS.length).padStart(2, "0")}
          </span>
          <span className="relative h-px flex-1 overflow-hidden bg-ink/15">
            {!reduce && !held && onScreen && (
              <motion.span
                key={`bar-${step}`}
                className="absolute inset-0 origin-left bg-accent"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: STEP_MS / 1000, ease: "linear" }}
              />
            )}
          </span>
          <span>{held ? "Paused" : "Live loop"}</span>
        </div>
        <div className="relative mt-3 min-h-[5.5rem]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active.id}
              initial={reduce ? false : { opacity: 0, y: 10, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduce ? undefined : { opacity: 0, y: -8, filter: "blur(6px)" }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <p className="text-lg font-bold tracking-tight text-fg">{active.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-secondary">{active.body}</p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
