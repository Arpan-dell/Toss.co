"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// "How it works" as scroll-driven motion graphics, one track per role (customer, driver, manager).
// Steps scroll by on one side; a sticky device on the other morphs to match the active step, and
// some motion is tied directly to scroll position (the basket fills, the route draws, the forecast
// rises) through the --p CSS variable (0 → 1 across the active step). Nothing autoplays: the reader
// sets the pace. Reduced-motion users get the same content without the animation.

type Role = "customer" | "driver" | "manager";
type Step = { title: string; body: string; tag: string };

const ROLES: { id: Role; icon: string; label: string; short: string; device: "phone" | "window"; app: string; steps: Step[] }[] = [
  {
    id: "customer",
    icon: "🏠",
    label: "Customer",
    short: "Customer",
    device: "phone",
    app: "Toss",
    steps: [
      { tag: "1 minute", title: "Join with your phone number", body: "Sign up, then enter your laundry's Business ID. Your basket, orders and invoices now live in one place." },
      { tag: "Zero effort", title: "Just keep filling the basket", body: "A scale inside weighs your laundry around the clock. No app to open, no slot to book." },
      { tag: "Automatic", title: "It calls the pickup for you", body: "At your target weight, Toss sends the nearest driver and tells you on Telegram who's coming and when." },
      { tag: "2 taps", title: "Pay by any UPI app", body: "Your invoice appears the moment the pickup is done. Pay with GPay, PhonePe or Paytm; the PDF receipt lands in your inbox." },
      { tag: "Rewards", title: "Get thanked for coming back", body: "Toss AI notices when you've been away and sends a personal discount for your next pickup." },
    ],
  },
  {
    id: "driver",
    icon: "🚚",
    label: "Driver",
    short: "Driver",
    device: "phone",
    app: "Toss Handy",
    steps: [
      { tag: "No app", title: "Connect with your number", body: "Your laundry adds you by name and phone. Open Toss Handy on Telegram, share your number, and you're in." },
      { tag: "1 tap", title: "Go online, share live location", body: "Tap 🟢 Online when your shift starts. Your live location lets Toss send you the jobs nearest to you." },
      { tag: "Nearest first", title: "Pickups come to you", body: "Each job arrives with the address, weight and customer, plus buttons to navigate, pick up or pass it on." },
      { tag: "Google Maps", title: "Follow one smart route", body: "Every stop in the best order, ending at your store, kept up to date as new pickups join." },
      { tag: "Done", title: "Tap “Picked up”, deliver, repeat", body: "Each tap updates the customer and your laundry instantly. Your daily count and status are always one tap away." },
    ],
  },
  {
    id: "manager",
    icon: "🏭",
    label: "Laundry manager",
    short: "Manager",
    device: "window",
    app: "Toss · Manager",
    steps: [
      { tag: "Free trial", title: "Launch your laundry on Toss", body: "Register in a minute and get a Business ID. Customers enter it once and their baskets connect to you." },
      { tag: "Real time", title: "See every pickup, live", body: "New pickups appear the second a basket fills, already assigned to the nearest driver." },
      { tag: "Cash flow", title: "Get paid without chasing", body: "Customers pay by UPI; you confirm with one tap and the invoice is emailed automatically." },
      { tag: "Toss AI", title: "Know what's coming", body: "A daily AI briefing forecasts busy days, flags customers drifting away and money stuck in old invoices." },
      { tag: "Autopilot", title: "Let it run itself", body: "Switch on autopilot: driver alerts, win-back offers and payment reminders happen every morning, within your limits." },
    ],
  },
];

const BLOBS: Record<Role, string[]> = {
  customer: ["rgb(250 204 21 / 0.35)", "rgb(2 169 161 / 0.45)", "rgb(37 99 235 / 0.4)"],
  driver: ["rgb(42 171 238 / 0.45)", "rgb(2 169 161 / 0.4)", "rgb(250 204 21 / 0.3)"],
  manager: ["rgb(139 123 255 / 0.5)", "rgb(34 211 238 / 0.35)", "rgb(2 169 161 / 0.35)"],
};

// ---------- scroll progress: listeners update text directly (no re-render per frame) ----------
type Listener = (p: number) => void;
const listeners = new Set<Listener>();
let lastP = 0; // so a scene that mounts mid-step starts from the current scroll position
function useProgress(fn: Listener) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    const l: Listener = (p) => ref.current(p);
    listeners.add(l);
    l(lastP);
    return () => {
      listeners.delete(l);
    };
  }, []);
}

function ProgressNumber({ to, decimals = 0, prefix = "", suffix = "" }: { to: number; decimals?: number; prefix?: string; suffix?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  useProgress((p) => {
    if (el.current) el.current.textContent = `${prefix}${(Math.min(1, p * 1.25) * to).toFixed(decimals)}${suffix}`;
  });
  return <span ref={el}>{`${prefix}${(0).toFixed(decimals)}${suffix}`}</span>;
}

// ---------- tiny UI pieces used inside the devices ----------
const Bubble = ({ children, me = false, delay = 0, accent = false }: { children: React.ReactNode; me?: boolean; delay?: number; accent?: boolean }) => (
  <div className={`mg-rise max-w-[85%] rounded-2xl px-3 py-2 text-[11px] leading-snug shadow ${me ? "ml-auto rounded-br-md bg-[#2b5278] text-white" : accent ? "rounded-bl-md border border-white/10 bg-[#182533] text-white" : "rounded-bl-md bg-[#182533] text-white/90"}`} style={{ animationDelay: `${delay}ms` }}>
    {children}
  </div>
);
const Btn = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => (
  <span className="mg-pop block rounded-lg bg-[#2AABEE]/25 py-1.5 text-center text-[10px] text-white" style={{ animationDelay: `${delay}ms` }}>
    {children}
  </span>
);
const Row = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => (
  <div className="mg-rise flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-white/[0.04] px-2.5 py-2 text-[10px]" style={{ animationDelay: `${delay}ms` }}>
    {children}
  </div>
);
const Chip = ({ children, tone = "good" }: { children: React.ReactNode; tone?: "good" | "warn" | "info" }) => (
  <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${tone === "good" ? "bg-emerald-400/15 text-emerald-300" : tone === "warn" ? "bg-amber-400/15 text-amber-300" : "bg-sky-400/15 text-sky-300"}`}>{children}</span>
);

function TypeLine({ text, delay }: { text: string; delay: number }) {
  return (
    <span className="relative block overflow-hidden whitespace-nowrap">
      <span className="mg-type inline-block overflow-hidden align-bottom" style={{ animationDelay: `${delay}ms`, ["--chars" as string]: text.length } as React.CSSProperties}>
        {text}
      </span>
    </span>
  );
}

// ---------- customer scenes (phone, Toss web app + Toss Control) ----------
function CustomerScene({ step }: { step: number }) {
  if (step === 0)
    return (
      <div className="space-y-3 p-4">
        <p className="mg-rise text-sm font-semibold text-white">Create your account</p>
        <div className="mg-rise rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-white/80" style={{ animationDelay: "200ms" }}>
          <p className="text-[9px] text-white/40">Mobile number</p>
          <TypeLine text="+91 98765 43210" delay={500} />
        </div>
        <div className="mg-rise rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-white/80" style={{ animationDelay: "350ms" }}>
          <p className="text-[9px] text-white/40">Your laundry&apos;s Business ID</p>
          <TypeLine text="B-E2ZRFP" delay={1500} />
        </div>
        <div className="mg-pop flex items-center gap-2 rounded-xl bg-emerald-400/15 px-3 py-2 text-[11px] text-emerald-300" style={{ animationDelay: "2300ms" }}>
          ✓ Connected to <b className="text-white">Fresh</b> · ₹100/kg
        </div>
      </div>
    );
  if (step === 1)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
        <svg viewBox="0 0 200 120" className="w-[88%]">
          <defs>
            <linearGradient id="hs-g" x1="0" x2="1">
              <stop offset="0" stopColor="#facc15" />
              <stop offset="1" stopColor="#02a9a1" />
            </linearGradient>
          </defs>
          <path d="M20 110 A80 80 0 0 1 180 110" fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="14" strokeLinecap="round" />
          <path d="M20 110 A80 80 0 0 1 180 110" fill="none" stroke="url(#hs-g)" strokeWidth="14" strokeLinecap="round" strokeDasharray="252" style={{ strokeDashoffset: "calc(252px * (1 - min(1, var(--p) * 1.25)))", filter: "drop-shadow(0 0 10px rgb(2 169 161 / 0.6))" }} />
        </svg>
        <p className="-mt-14 text-4xl font-semibold tabular-nums text-white">
          <ProgressNumber to={5} decimals={1} />
          <span className="text-base text-white/50"> kg</span>
        </p>
        <p className="text-[11px] text-white/50">Auto-pickup at 5.0 kg</p>
        <div className="mt-2 flex w-full justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-[10px] text-white/60">
          <span>📡 Basket online</span>
          <span>Wi-Fi strong</span>
        </div>
      </div>
    );
  if (step === 2)
    return (
      <div className="flex h-full flex-col gap-2 bg-[#0e1621] p-3">
        <p className="mg-rise text-center text-[10px] text-white/40">Toss Control · today</p>
        <Bubble delay={200}>🚚 <b>Pickup requested!</b><br />Order #104 · 5.0 kg</Bubble>
        <Bubble delay={900} accent>🙋 <b>Vikram</b> is on the way<br />ETA about 18 min</Bubble>
        <div className="mg-rise relative mt-1 h-24 overflow-hidden rounded-xl bg-[#13202c]" style={{ animationDelay: "1500ms" }}>
          <svg viewBox="0 0 220 96" className="absolute inset-0 size-full">
            <path d="M15 80 C60 20 110 90 160 40 S205 20 210 18" fill="none" stroke="#5eead4" strokeWidth="3" strokeDasharray="4 5" opacity="0.7" />
          </svg>
          <span className="hs-follow absolute size-3 rounded-full bg-white shadow-[0_0_10px_#fff]" style={{ offsetPath: "path('M15 80 C60 20 110 90 160 40 S205 20 210 18')" }} />
          <span className="absolute right-2 top-1 text-sm">🏠</span>
        </div>
        <Bubble delay={2300}>✅ Picked up. Thank you!</Bubble>
      </div>
    );
  if (step === 3)
    return (
      <div className="space-y-2.5 p-4">
        <div className="mg-rise relative rounded-xl bg-white p-3 text-[#111827]">
          <div className="flex justify-between text-[10px]"><b>INVOICE</b><span className="text-gray-400">TOSS-2026-000104</span></div>
          <div className="mt-1.5 flex justify-between text-[10px] text-gray-600"><span>Laundry · 5.0 kg</span><span>₹500</span></div>
          <div className="flex justify-between text-[10px] text-emerald-600"><span>Welcome back −10%</span><span>−₹50</span></div>
          <div className="mt-1.5 flex justify-between border-t pt-1.5 text-xs font-bold"><span>Total</span><span>₹450</span></div>
          <span className="mg-stamp absolute -right-2 -bottom-2 rounded border-2 border-emerald-500 bg-white px-1.5 text-[11px] font-extrabold tracking-widest text-emerald-600" style={{ animationDelay: "1900ms" }}>PAID</span>
        </div>
        <p className="mg-rise text-[10px] text-white/50" style={{ animationDelay: "300ms" }}>Pay with</p>
        <div className="grid grid-cols-2 gap-1.5">
          {["GPay", "PhonePe", "Paytm", "BHIM"].map((a, i) => (
            <span key={a} className={`mg-pop rounded-lg py-2 text-center text-[11px] text-white ${i === 0 ? "bg-white/15 ring-1 ring-white/30" : "bg-white/[0.06]"}`} style={{ animationDelay: `${450 + i * 120}ms` }}>{a}</span>
          ))}
        </div>
        <div className="mg-rise flex items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2 text-[10px] text-white/70" style={{ animationDelay: "2400ms" }}>
          📄 Invoice PDF sent to your email
        </div>
      </div>
    );
  return (
    <div className="flex h-full flex-col justify-center gap-3 p-4">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="hs-confetti absolute size-1.5 rounded-sm" style={{ left: `${8 + i * 9}%`, background: ["#facc15", "#5eead4", "#a78bfa", "#fb7185"][i % 4], animationDelay: `${i * 90}ms` }} />
      ))}
      <div className="mg-pop rounded-2xl border border-amber-300/40 bg-gradient-to-br from-amber-300/20 to-transparent p-4 text-center">
        <p className="text-3xl">🎁</p>
        <p className="mt-1 text-lg font-semibold text-white">15% off</p>
        <p className="text-[11px] text-white/70">your next pickup from Fresh</p>
      </div>
      <p className="mg-rise text-center text-[10px] text-white/50" style={{ animationDelay: "700ms" }}>
        Applied automatically · valid 14 days
      </p>
    </div>
  );
}

// ---------- driver scenes (phone, Toss Handy on Telegram) ----------
function DriverScene({ step }: { step: number }) {
  if (step === 0)
    return (
      <div className="flex h-full flex-col gap-2 bg-[#0e1621] p-3">
        <div className="mg-rise overflow-hidden rounded-xl bg-gradient-to-br from-[#02a9a1]/50 to-amber-400/30 p-3 text-center text-[11px] font-semibold text-white">TOSS · HANDY</div>
        <Bubble delay={300}>👋 <b>Welcome to Toss Handy</b><br />Share your number to connect.</Bubble>
        <div className="mg-pop mt-auto rounded-lg bg-[#2AABEE] py-2 text-center text-[11px] font-medium text-white" style={{ animationDelay: "800ms" }}>📱 Share my phone number</div>
        <Bubble me delay={1500}>📞 +91 93115 47292</Bubble>
        <Bubble delay={2100} accent>✅ <b>You&apos;re connected!</b><br />Hi Aviraj, you drive for Fresh.</Bubble>
      </div>
    );
  if (step === 1)
    return (
      <div className="relative h-full overflow-hidden bg-[#13202c]">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="absolute inset-y-0 w-px bg-white/[0.04]" style={{ left: `${i * 20}%` }} />
        ))}
        <div className="absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2">
          <span className="hs-radar absolute top-1/2 left-1/2 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#5eead4]" />
          <span className="hs-radar absolute top-1/2 left-1/2 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#5eead4]" style={{ animationDelay: "0.9s" }} />
          <span className="relative block size-4 rounded-full border-2 border-white bg-[#2AABEE] shadow-[0_0_14px_#2AABEE]" />
        </div>
        <div className="absolute inset-x-3 bottom-3 space-y-2">
          <div className="mg-rise flex items-center justify-between rounded-xl bg-[#0e1621]/95 px-3 py-2.5 text-[11px] text-white">
            <span>Status</span>
            <span className="hs-switch relative h-5 w-9 rounded-full bg-white/15">
              <span className="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow" />
            </span>
          </div>
          <Bubble delay={1100} accent>🟢 <b>You&apos;re online</b> · 📍 live location on</Bubble>
        </div>
      </div>
    );
  if (step === 2)
    return (
      <div className="flex h-full flex-col gap-2 bg-[#0e1621] p-3">
        <div className="mg-rise rounded-2xl border border-white/10 bg-[#182533] p-3 text-[11px] text-white" style={{ animationDelay: "200ms" }}>
          <p className="font-semibold">🔔 NEW PICKUP · #104</p>
          <div className="my-1.5 h-px bg-white/10" />
          <p>📍 C-12, Saket <span className="text-white/50">· 1.2 km away</span></p>
          <p>👤 Riya · 📞 98765 43210</p>
          <p>⚖️ 5.0 kg · 🏁 then deliver to Fresh</p>
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <Btn delay={900}>🗺 Navigate to pickup</Btn>
          <Btn delay={1050}>🛣 My full route</Btn>
          <div className="grid grid-cols-2 gap-1.5">
            <Btn delay={1200}>✅ Picked up</Btn>
            <Btn delay={1300}>↩️ Can&apos;t take it</Btn>
          </div>
        </div>
      </div>
    );
  if (step === 3) {
    const path = "M24 300 C70 210 30 170 110 150 S200 90 150 50 S230 20 236 24";
    return (
      <div className="relative h-full overflow-hidden bg-[#13202c]">
        <svg viewBox="0 0 260 330" className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid slice">
          {Array.from({ length: 7 }, (_, i) => (
            <path key={i} d={`M${i * 45 - 20} 0 L${i * 45 + 40} 330`} stroke="rgb(255 255 255 / 0.04)" strokeWidth="10" />
          ))}
          <path d={path} fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="7" strokeLinecap="round" />
          <path d={path} fill="none" stroke="#5eead4" strokeWidth="5" strokeLinecap="round" strokeDasharray="520" style={{ strokeDashoffset: "calc(520px * (1 - min(1, var(--p) * 1.2)))", filter: "drop-shadow(0 0 6px #5eead4)" }} />
          <text x="24" y="314" textAnchor="middle" fontSize="16">🚚</text>
          <text x="110" y="142" textAnchor="middle" fontSize="15">🏠</text>
          <text x="150" y="42" textAnchor="middle" fontSize="15">🏠</text>
          <text x="236" y="20" textAnchor="middle" fontSize="16">🏁</text>
        </svg>
        <div className="absolute inset-x-3 bottom-3 rounded-xl bg-[#0e1621]/95 px-3 py-2 text-[10px] text-white">
          🛣 <b>2 pickups</b>, then the store · <ProgressNumber to={6.4} decimals={1} suffix=" km" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col gap-2 bg-[#0e1621] p-3">
      <Bubble delay={100} accent>✅ <b>Picked up</b> · #104<br /><s className="text-white/50">C-12, Saket</s></Bubble>
      <Bubble delay={700} accent>✅ <b>Picked up</b> · #105<br /><s className="text-white/50">B-4/11, Hauz Khas</s></Bubble>
      <Bubble delay={1300}>🏁 <b>All pickups done!</b><br />Deliver to Fresh, Mukherjee Nagar.</Bubble>
      <div className="mg-rise mt-auto rounded-xl bg-[#182533] p-3 text-[11px] text-white" style={{ animationDelay: "1900ms" }}>
        👤 <b>Aviraj</b> · Fresh
        <div className="my-1.5 h-px bg-white/10" />
        <p>Status: 🟢 Online</p>
        <p>✅ Done today: <b>6</b></p>
      </div>
    </div>
  );
}

// ---------- manager scenes (browser window, Toss dashboard) ----------
function ManagerScene({ step }: { step: number }) {
  if (step === 0)
    return (
      <div className="grid h-full grid-cols-2 gap-3 p-4">
        <div className="mg-rise flex flex-col justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-[10px] text-white/50">Business ID</p>
          <p className="font-mono text-xl font-semibold tracking-wider text-white">B-E2ZRFP</p>
          <p className="text-[10px] text-white/50">Share it with your customers</p>
        </div>
        <div className="mg-pop grid place-items-center rounded-xl bg-white p-3" style={{ animationDelay: "400ms" }}>
          <div className="grid size-20 grid-cols-7 gap-px">
            {Array.from({ length: 49 }, (_, i) => (
              <span key={i} className={((i * 37 + (i >> 2) * 11) % 5 < 2 || [0, 1, 2, 7, 9, 14, 15, 16, 4, 5, 6, 11, 13, 18, 19, 20, 28, 29, 30, 35, 37, 42, 43, 44].includes(i)) ? "bg-black" : "bg-white"} />
            ))}
          </div>
        </div>
        <div className="mg-rise col-span-2 grid grid-cols-3 gap-2" style={{ animationDelay: "800ms" }}>
          {[
            ["Customers", 48],
            ["Baskets", 52],
            ["Drivers", 5],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white/[0.04] p-2.5">
              <p className="text-[9px] text-white/50">{k}</p>
              <p className="text-lg font-semibold text-white tabular-nums"><ProgressNumber to={Number(v)} /></p>
            </div>
          ))}
        </div>
      </div>
    );
  if (step === 1)
    return (
      <div className="space-y-1.5 p-4">
        <div className="mg-rise mb-2 flex items-center gap-2 text-[11px] text-white">
          <span className="size-2 animate-pulse rounded-full bg-emerald-400" /> Live board
        </div>
        {[
          ["Saket · #104", "5.0 kg", "Aviraj", "good"],
          ["Hauz Khas · #105", "6.2 kg", "Vikram", "good"],
          ["Dwarka · #212", "4.4 kg", "Assigning…", "warn"],
          ["Karol Bagh · #117", "5.1 kg", "Imran", "good"],
        ].map(([o, w, d, t], i) => (
          <Row key={o} delay={200 + i * 380}>
            <span className="text-white">{o}</span>
            <span className="text-white/50">{w}</span>
            <Chip tone={t as "good" | "warn"}>🚚 {d}</Chip>
          </Row>
        ))}
      </div>
    );
  if (step === 2)
    return (
      <div className="space-y-1.5 p-4">
        <p className="mg-rise mb-1 text-[11px] text-white">Payments to confirm</p>
        <Row delay={200}>
          <span className="text-white">#104 · ₹450</span>
          <span className="font-mono text-white/50">UPI 4123…8901</span>
          <span className="mg-pop rounded-md bg-emerald-400 px-2 py-0.5 text-[9px] font-semibold text-black" style={{ animationDelay: "900ms" }}>✓ Received</span>
        </Row>
        <Row delay={1300}>
          <span className="text-white/70">📄 Invoice TOSS-2026-000104</span>
          <Chip tone="info">emailed to Riya</Chip>
        </Row>
        <div className="mg-rise mt-3 grid grid-cols-2 gap-2" style={{ animationDelay: "1800ms" }}>
          <div className="rounded-xl bg-white/[0.04] p-2.5"><p className="text-[9px] text-white/50">Collected (30d)</p><p className="text-lg font-semibold text-white">96%</p></div>
          <div className="rounded-xl bg-white/[0.04] p-2.5"><p className="text-[9px] text-white/50">Cash in 7 days</p><p className="text-lg font-semibold text-white">₹3,240</p></div>
        </div>
      </div>
    );
  if (step === 3) {
    const bars = [38, 30, 34, 42, 55, 92, 100];
    return (
      <div className="grid h-full grid-cols-5 gap-3 p-4">
        <div className="col-span-3 flex flex-col rounded-xl bg-white/[0.04] p-3">
          <p className="text-[10px] text-white/50">Next 7 days · pickups</p>
          <div className="mt-2 flex flex-1 items-end gap-1.5">
            {bars.map((b, i) => (
              <span key={i} className="flex-1 rounded-t" style={{ height: `calc(${b}% * min(1, var(--p) * 1.3))`, background: i === 6 ? "#d95926" : "#3987e5", transition: "height 0.2s linear" }} />
            ))}
          </div>
          <p className="mt-1.5 text-[9px] text-white/40">Backtested accuracy 86%</p>
        </div>
        <div className="col-span-2 flex flex-col items-center justify-center gap-1 rounded-xl bg-white/[0.04] p-3">
          <svg viewBox="0 0 80 80" className="size-16 -rotate-90">
            <circle cx="40" cy="40" r="32" fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="8" />
            <circle cx="40" cy="40" r="32" fill="none" stroke="#4ade80" strokeWidth="8" strokeLinecap="round" strokeDasharray="201" style={{ strokeDashoffset: "calc(201px * (1 - 0.82 * min(1, var(--p) * 1.3)))" }} />
          </svg>
          <p className="text-sm font-semibold text-white"><ProgressNumber to={82} /></p>
          <p className="text-[9px] text-white/50">Health</p>
        </div>
        <p className="mg-rise col-span-5 rounded-xl border border-violet-400/30 bg-violet-400/10 p-2.5 text-[10px] text-white/90" style={{ animationDelay: "500ms" }}>
          ✨ “Saturday 4–7 pm brings 31% of pickups. Two regulars are overdue: ₹18,400 a year at risk.”
        </p>
      </div>
    );
  }
  return (
    <div className="grid h-full grid-cols-2 gap-3 p-4">
      <div className="space-y-1.5">
        {["🚀 Automate everything", "📈 Driver staffing", "🎁 Win-back offers", "🧾 Customer nudges"].map((t, i) => (
          <div key={t} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-2.5 py-2 text-[10px] text-white">
            {t}
            <span className="hs-switch relative h-4 w-7 rounded-full bg-white/15" style={{ animationDelay: `${300 + i * 300}ms` }}>
              <span className="absolute top-0.5 left-0.5 size-3 rounded-full bg-white" />
            </span>
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <p className="text-[10px] text-white/50">Activity · this morning</p>
        {["📈 Alerted 4 drivers: busy Saturday", "🎁 15% offer sent to C-PKQUTG", "🧾 Reminded C-KH7QVB about ₹271"].map((t, i) => (
          <Row key={t} delay={1500 + i * 400}>
            <span className="text-white/80">{t}</span>
            <Chip>Autopilot</Chip>
          </Row>
        ))}
      </div>
    </div>
  );
}

// ---------- motion-graphics layer around the device ----------
// Big kinetic keyword, orbit rings with a scroll-progress arc, a shape that morphs per step,
// parallax particles, a light beam + glow burst on every step change, and floating info chips.

const WORDS: Record<Role, string[]> = {
  customer: ["JOIN", "FILL", "PICKUP", "PAY", "REWARD"],
  driver: ["CONNECT", "ONLINE", "NEAREST", "ROUTE", "DONE"],
  manager: ["LAUNCH", "LIVE", "PAID", "FORECAST", "AUTOPILOT"],
};
const RING: Record<Role, [string, string]> = { customer: ["#facc15", "#02a9a1"], driver: ["#2AABEE", "#5eead4"], manager: ["#8b7bff", "#22d3ee"] };
const CHIPS: Record<Role, [string, string][][]> = {
  customer: [
    [["📱", "+91 98765 43210"], ["🏷️", "B-E2ZRFP"], ["✅", "Connected"]],
    [["⚖️", "Live weight"], ["📡", "Basket online"], ["🎯", "Target 5 kg"]],
    [["🚚", "Driver assigned"], ["⏱️", "ETA 18 min"], ["💬", "Telegram alert"]],
    [["💳", "₹450 paid"], ["⚡", "UPI in 2 taps"], ["📄", "PDF invoice"]],
    [["🎁", "15% off"], ["✨", "Toss AI"], ["💜", "Welcome back"]],
  ],
  driver: [
    [["📞", "Phone verified"], ["🤝", "Fresh"], ["✅", "Connected"]],
    [["🟢", "Online"], ["📍", "Live location"], ["📡", "Nearest jobs"]],
    [["🔔", "New pickup"], ["📍", "1.2 km away"], ["⚖️", "5.0 kg"]],
    [["🗺️", "Google Maps"], ["🛣️", "2 stops"], ["🏁", "Ends at store"]],
    [["✅", "Picked up"], ["📊", "6 today"], ["🏁", "Delivered"]],
  ],
  manager: [
    [["🏷️", "Business ID"], ["🎟️", "Free trial"], ["👥", "48 customers"]],
    [["⚡", "Live updates"], ["🚚", "Auto-assigned"], ["🧺", "52 baskets"]],
    [["💰", "96% collected"], ["📧", "Invoice emailed"], ["🧾", "UPI verified"]],
    [["📈", "86% accurate"], ["❤️", "Health 82"], ["⚠️", "₹18k at risk"]],
    [["🚀", "Autopilot"], ["🛡️", "Your limits"], ["☀️", "Every morning"]],
  ],
};
const CHIP_POS: Record<"phone" | "window", React.CSSProperties[]> = {
  phone: [
    { left: "2.5%", top: "22%" },
    { right: "2.5%", top: "44%" },
    { left: "2.5%", bottom: "16%" },
  ],
  window: [
    { left: "4%", top: "16%" },
    { right: "4%", top: "16%" },
    { right: "6%", bottom: "7%" },
  ],
};
const CHIP_DRIFT = [-48, 36, -28];
const SHAPES = ["50%", "30%", "14% 50% 14% 50%", "22%", "50% 16%"];
const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  left: (i * 53) % 100,
  top: (i * 37 + 11) % 100,
  size: 2 + (i % 3),
  speed: [-90, -50, -20, 30, 70][i % 5],
  delay: (i % 6) * 0.45,
}));

function MotionLayer({ role, step }: { role: Role; step: number }) {
  const [c1, c2] = RING[role];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
      {/* kinetic keyword, sliding with scroll */}
      <div key={`w-${role}-${step}`} className="absolute inset-x-0 top-[8%] overflow-hidden text-center">
        <span
          className="hs-outline hs-word-in inline-block whitespace-nowrap leading-none font-black"
          style={{ fontSize: `min(9.5rem, ${Math.round(118 / WORDS[role][step].length)}cqw)`, transform: "translateX(calc((0.5 - var(--p)) * 14%))" }}
        >
          {WORDS[role][step]}
        </span>
      </div>

      {/* shape that morphs from step to step and turns with scroll */}
      <div
        className="absolute aspect-square w-[52%] max-w-[440px] border-2 transition-[border-radius,border-color] duration-1000 ease-[cubic-bezier(0.65,0,0.35,1)]"
        style={{ borderRadius: SHAPES[step], borderColor: `${c1}55`, transform: `rotate(calc(${step * 45}deg + var(--p) * 90deg))`, boxShadow: `0 0 60px -20px ${c1}` }}
      />

      {/* orbit rings + an arc that draws as you scroll through the step */}
      <svg viewBox="0 0 400 400" className="absolute aspect-square h-[92%] max-w-[96%]">
        <defs>
          <linearGradient id={`hs-ring-${role}`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor={c1} />
            <stop offset="1" stopColor={c2} />
          </linearGradient>
        </defs>
        <circle cx="200" cy="200" r="188" fill="none" stroke="rgb(255 255 255 / 0.07)" strokeDasharray="2 9" className="mg-orbit" />
        <circle cx="200" cy="200" r="150" fill="none" stroke="rgb(255 255 255 / 0.06)" strokeDasharray="40 18" className="mg-orbit-rev" />
        <circle
          cx="200"
          cy="200"
          r="170"
          fill="none"
          stroke={`url(#hs-ring-${role})`}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="1068"
          transform="rotate(-90 200 200)"
          style={{ strokeDashoffset: "calc(1068px * (1 - var(--p)))", filter: `drop-shadow(0 0 8px ${c1})` }}
        />
      </svg>

      {/* parallax particles */}
      {PARTICLES.map((pt, i) => (
        <span
          key={i}
          className="hs-twinkle absolute rounded-full bg-white"
          style={{ left: `${pt.left}%`, top: `${pt.top}%`, width: pt.size, height: pt.size, transform: `translateY(calc(var(--p) * ${pt.speed}px))`, animationDelay: `${pt.delay}s` }}
        />
      ))}

      {/* every step change: a light beam sweeps across and a glow ring bursts */}
      <div key={`fx-${role}-${step}`} className="absolute inset-0">
        <span className="mg-beam absolute top-[52%] left-0 h-[2px] w-1/2 rounded-full opacity-0" style={{ background: `linear-gradient(90deg, transparent, ${c1}, #fff)`, boxShadow: `0 0 18px 3px ${c1}` }} />
        <span className="mg-burst absolute top-1/2 left-1/2 size-56 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ borderColor: c2 }} />
      </div>
    </div>
  );
}

function Satellites({ role, step, device }: { role: Role; step: number; device: "phone" | "window" }) {
  return (
    <div key={`s-${role}-${step}`} aria-hidden className="pointer-events-none absolute inset-0 z-20 hidden sm:block">
      {CHIPS[role][step].map(([icon, text], i) => (
        <div key={text} className="absolute" style={{ ...CHIP_POS[device][i], transform: `translateY(calc((var(--p) - 0.5) * ${CHIP_DRIFT[i]}px))` }}>
          <div className="mg-pop" style={{ animationDelay: `${450 + i * 220}ms` }}>
            <div className="mg-bob flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.07] px-3 py-2 text-xs font-medium whitespace-nowrap text-white shadow-[0_12px_40px_-12px_rgb(0_0_0/0.8)] backdrop-blur-md" style={{ animationDelay: `${i * 0.7}s` }}>
              <span className="grid size-6 place-items-center rounded-lg bg-white/10 text-sm">{icon}</span>
              {text}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- devices ----------
function Phone({ app, children }: { app: string; children: React.ReactNode }) {
  return (
    <div className="relative mx-auto aspect-[9/18.5] w-[min(270px,62vw)] rounded-[2.4rem] border border-white/15 bg-[#05070b] p-2 shadow-[0_40px_100px_-30px_rgb(0_0_0/0.9),inset_0_0_0_1px_rgb(255_255_255/0.04)]">
      <div className="absolute top-3.5 left-1/2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />
      <div className="relative flex h-full flex-col overflow-hidden rounded-[1.9rem] bg-[#0b0f16]">
        <div className="flex items-center justify-between px-5 pt-3 pb-1 text-[9px] text-white/60">
          <span>9:41</span>
          <span>●●● 5G</span>
        </div>
        <div className="border-b border-white/5 px-4 py-2 text-center text-[11px] font-medium text-white">{app}</div>
        <div className="relative flex-1">{children}</div>
      </div>
    </div>
  );
}

function Window({ app, children }: { app: string; children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-[520px] overflow-hidden rounded-2xl border border-white/15 bg-[#0b0f16] shadow-[0_40px_100px_-30px_rgb(0_0_0/0.9)]">
      <div className="flex items-center gap-1.5 border-b border-white/5 px-3 py-2">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 rounded-md bg-white/[0.06] px-3 py-0.5 text-[10px] text-white/50">{app}</span>
      </div>
      <div className="relative aspect-[16/10]">{children}</div>
    </div>
  );
}

// ---------- section ----------
export function HowScrolly() {
  const [role, setRole] = useState<Role>("customer");
  const [step, setStep] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const stepEls = useRef<(HTMLElement | null)[]>([]);
  const R = ROLES.find((r) => r.id === role)!;

  const measure = useCallback(() => {
    const vh = window.innerHeight;
    // On phones the device sits on top, so a step becomes active just below it, not behind it.
    const stageBottom = stage.current?.getBoundingClientRect().bottom ?? 0;
    const mid = window.innerWidth < 1024 ? Math.min(vh * 0.9, Math.max(vh * 0.55, stageBottom + 40)) : vh * 0.55;
    let active = 0;
    stepEls.current.forEach((el, i) => {
      if (el && el.getBoundingClientRect().top < mid) active = i;
    });
    const el = stepEls.current[active];
    let p = 0;
    if (el) {
      const r = el.getBoundingClientRect();
      p = Math.min(1, Math.max(0, (mid - r.top) / Math.max(r.height, 1)));
    }
    stage.current?.style.setProperty("--p", String(p));
    lastP = p;
    listeners.forEach((l) => l(p));
    setStep((s) => (s === active ? s : active));
  }, []);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure); // first measurement on the next frame
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [measure, role]);

  const pick = (r: Role) => {
    setRole(r);
    setStep(0);
    document.getElementById("how-steps")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div>
      {/* role switcher */}
      <div className="sticky top-16 z-30 flex justify-center py-3">
        <div className="relative flex rounded-full border border-white/10 bg-surface-solid/85 p-1 shadow-xl backdrop-blur" role="tablist" aria-label="Who are you?">
          <span
            aria-hidden
            className="absolute inset-y-1 rounded-full bg-gradient-to-r from-[#8b7bff] to-[#22d3ee] transition-all duration-500 ease-[cubic-bezier(0.65,0,0.35,1)]"
            style={{ left: `calc(${ROLES.findIndex((r) => r.id === role)} * (100% - 8px) / 3 + 4px)`, width: "calc((100% - 8px) / 3)" }}
          />
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={role === r.id}
              onClick={() => pick(r.id)}
              className={`relative z-10 w-[6.6rem] whitespace-nowrap rounded-full px-2 py-2 text-xs font-medium transition-colors sm:w-44 sm:px-3 sm:text-sm ${role === r.id ? "text-white" : "text-secondary hover:text-fg"}`}
            >
              {r.icon} <span className="sm:hidden">{r.short}</span>
              <span className="hidden sm:inline">{r.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div id="how-steps" className="relative grid scroll-mt-32 gap-8 lg:grid-cols-2 lg:gap-14">
        {/* sticky stage (on top on phones, on the right on desktop) */}
        <div className="sticky top-28 z-10 -mx-4 h-[50vh] bg-[var(--bg)] px-4 pb-3 lg:top-32 lg:order-2 lg:mx-0 lg:h-[calc(100vh-9rem)] lg:bg-transparent lg:px-0 lg:pb-0">
          <div ref={stage} className="relative grid h-full place-items-center overflow-hidden rounded-[2rem] border border-white/10 bg-[#04060a] [container-type:inline-size]" style={{ ["--p" as string]: 0 } as React.CSSProperties}>
            {BLOBS[role].map((c, i) => (
              <span
                key={i}
                className="mg-blob size-[60%]"
                style={{
                  background: c,
                  left: `${[18, 78, 45][i] + ((step * 13 + i * 29) % 24) - 12}%`,
                  top: `${[20, 35, 85][i] + ((step * 17 + i * 11) % 20) - 10}%`,
                  transform: "translate(-50%, -50%)",
                }}
              />
            ))}
            <MotionLayer role={role} step={step} />
            <Satellites role={role} step={step} device={R.device} />
            <div className="relative z-10 w-full scale-[0.78] px-4 sm:scale-90 lg:scale-100">
              <div
                className="transition-transform duration-150 ease-out"
                style={{ transform: "perspective(1400px) rotateY(calc((var(--p) - 0.5) * -16deg)) rotateX(calc((0.5 - var(--p)) * 7deg)) translateY(calc((0.5 - var(--p)) * 14px))" }}
              >
              {R.device === "phone" ? (
                <Phone app={R.app}>
                  <div key={`${role}-${step}`} className="absolute inset-0">
                    {role === "customer" ? <CustomerScene step={step} /> : <DriverScene step={step} />}
                  </div>
                </Phone>
              ) : (
                <Window app={R.app}>
                  <div key={`${role}-${step}`} className="absolute inset-0">
                    <ManagerScene step={step} />
                  </div>
                </Window>
              )}
              </div>
            </div>
            <div className="absolute top-4 left-4 z-20 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-[11px] text-white/70 backdrop-blur">
              {R.icon} {R.label} · step {step + 1} of {R.steps.length}
            </div>
          </div>
        </div>

        {/* steps */}
        <ol className="relative lg:order-1">
          <span aria-hidden className="absolute top-0 bottom-0 left-[15px] w-px bg-white/10" />
          {R.steps.map((s, i) => (
            <li
              key={`${role}-${i}`}
              ref={(el) => {
                stepEls.current[i] = el;
              }}
              className="relative flex min-h-[62vh] items-center pl-12 lg:min-h-[78vh]"
            >
              <span
                aria-hidden
                className={`absolute top-1/2 left-0 grid size-8 -translate-y-1/2 place-items-center rounded-full border font-mono text-xs transition-all duration-500 ${
                  i === step ? "scale-110 border-transparent bg-gradient-to-br from-[#8b7bff] to-[#22d3ee] text-white shadow-[0_0_24px_rgb(139_123_255/0.6)]" : i < step ? "border-[#02a9a1]/60 bg-[#02a9a1]/15 text-[#5eead4]" : "border-white/15 bg-surface-solid text-muted"
                }`}
              >
                {i < step ? "✓" : i + 1}
              </span>
              <div className={`relative max-w-md transition-all duration-500 ${i === step ? "opacity-100" : "opacity-35"}`}>
                <span
                  aria-hidden
                  className={`hs-outline pointer-events-none absolute -top-[5.2rem] -left-2 text-[6.5rem] leading-none font-black transition-all duration-700 select-none ${i === step ? "translate-x-0 opacity-100" : "-translate-x-4 opacity-0"}`}
                >
                  0{i + 1}
                </span>
                <span className="relative rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] tracking-wide text-accent">{s.tag}</span>
                <h3 key={i === step ? "on" : "off"} className="relative mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                  {i === step
                    ? s.title.split(" ").map((w, k) => (
                        <span key={k} className="mg-word mr-[0.25em]" style={{ animationDelay: `${k * 70}ms` }}>
                          {w}
                        </span>
                      ))
                    : s.title}
                </h3>
                <p className="mt-3 leading-relaxed text-secondary">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
