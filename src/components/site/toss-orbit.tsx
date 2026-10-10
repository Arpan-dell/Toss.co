"use client";

import Image from "next/image";
import { useState } from "react";
import { Basket, TelegramLogo, Truck, UsersThree, type Icon } from "@phosphor-icons/react";

// "Everything is connected": four rings of text around the Toss core, one for each part of the system (the
// basket, the Toss Control bot, the Toss Handy bot, the accounts). Hover or tap a part to light it up and read
// what it does; the line from the previous part, through the core, shows the hand-off. Still on purpose: the
// spinning rings and the auto-playing loop kept phones busy on the first screen.

const VB = 640;
const C = VB / 2;

type Ring = { id: string; name: string; r: number; angle: number; text: string; icon: Icon; title: string; body: string };

const RINGS: Ring[] = [
  {
    id: "basket",
    name: "Basket",
    r: 112,
    angle: 214,
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
    text: "ACCOUNTS · CUSTOMER · LAUNDRY · OWNER · UPI INVOICE · LIVE BOARD · ",
    icon: UsersThree,
    title: "Every account sees it live",
    body: "Your account, the laundry's live board and the owner's dashboard update together, and the bill lands in your account to pay by UPI.",
  },
];

const rad = (deg: number) => (deg * Math.PI) / 180;
const nodeAt = (ring: Ring) => [C + ring.r * Math.cos(rad(ring.angle)), C + ring.r * Math.sin(rad(ring.angle))] as const;
const circlePath = (r: number) => `M ${C - r} ${C} a ${r} ${r} 0 1 1 ${2 * r} 0 a ${r} ${r} 0 1 1 ${-2 * r} 0`;
// how many copies of the label fill a ring at roughly 10.5 user units per monospace character
const copies = (ring: Ring) => Math.max(1, Math.round((2 * Math.PI * ring.r) / (ring.text.length * 10.5)));

export function TossOrbit({ className = "" }: { className?: string }) {
  const [step, setStep] = useState(0);

  const active = RINGS[step];
  const prev = RINGS[(step + RINGS.length - 1) % RINGS.length];
  const [x1, y1] = nodeAt(prev);
  const [x2, y2] = nodeAt(active);
  // the signal bends through the core: every hand-off goes through Toss
  const signal = `M ${x1} ${y1} Q ${C} ${C} ${x2} ${y2}`;

  return (
    <div className={className}>
      <div role="group" aria-label="How the basket, the two Telegram bots and the accounts connect" className="relative mx-auto aspect-square w-full max-w-[640px] select-none">
        {/* rings of text */}
        {RINGS.map((ring) => {
          const on = ring.id === active.id;
          return (
            <div key={ring.id} aria-hidden className="absolute inset-0">
              <svg viewBox={`0 0 ${VB} ${VB}`} className="h-full w-full overflow-visible">
                <defs>
                  <path id={`orbit-${ring.id}`} d={circlePath(ring.r)} />
                </defs>
                <circle cx={C} cy={C} r={ring.r} fill="none" stroke="rgb(var(--ink-rgb) / 0.08)" strokeDasharray="2 6" />
                <text
                  className="font-mono font-semibold tracking-[0.18em]"
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

        {/* the hand-off: a line from the last part to the active one, through the core */}
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
          <path d={signal} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" opacity={0.9} />
          <circle cx={x2} cy={y2} r={6} fill="var(--accent)" />
        </svg>

        {/* the core */}
        <div aria-hidden className="absolute top-1/2 left-1/2 grid size-[17%] -translate-x-1/2 -translate-y-1/2 place-items-center">
          <span className="absolute inset-0 scale-125 rounded-full border border-accent/30" />
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
              onClick={() => setStep(i)}
              onMouseEnter={() => setStep(i)}
              onFocus={() => setStep(i)}
              aria-pressed={on}
              aria-label={ring.name}
              className="group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 outline-none"
              style={{ left: `${(x / VB) * 100}%`, top: `${(y / VB) * 100}%` }}
            >
              <span
                className={`grid size-11 place-items-center rounded-full border group-focus-visible:ring-2 group-focus-visible:ring-accent sm:size-12 ${
                  on ? "scale-110 border-accent bg-accent text-accent-contrast shadow-[0_0_30px_rgb(var(--accent-rgb)/0.55)]" : "border-border-strong bg-surface-solid text-fg"
                }`}
              >
                <Glyph size={20} weight={on ? "fill" : "regular"} />
              </span>
              <span className={`rounded-[4px] px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] whitespace-nowrap uppercase sm:text-[11px] ${on ? "bg-fg text-bg" : "bg-surface-solid/80 text-secondary"}`}>
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
          <span className="h-px flex-1 bg-ink/15" />
          <span>Tap a part</span>
        </div>
        <div className="relative mt-3 min-h-[5.5rem]" aria-live="polite">
          <p className="text-lg font-bold tracking-tight text-fg">{active.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-secondary">{active.body}</p>
        </div>
      </div>
    </div>
  );
}
