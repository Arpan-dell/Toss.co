"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// "How it works" as a short motion graphic: one continuous stage where glow blobs glide between
// six scenes, captions build word by word with a highlighted keyword, lines draw themselves and UI
// cards snap in. Plays while on screen, pauses on hover/tap, every scene is jumpable, and users who
// prefer reduced motion get the same story as still frames.

const SCENE_MS = 5200;

type Blob = { x: number; y: number; s: number; c: string; o?: number };
const TEAL = "rgb(2 169 161 / 0.55)";
const GREEN = "rgb(27 175 122 / 0.45)";
const YELLOW = "rgb(250 204 21 / 0.45)";
const BLUE = "rgb(37 99 235 / 0.5)";
const VIOLET = "rgb(139 123 255 / 0.45)";

const SCENES: { id: string; label: string; caption: [string, string, string]; blobs: [Blob, Blob, Blob] }[] = [
  { id: "basket", label: "Fill", caption: ["Everything starts with a full", "basket", "."], blobs: [{ x: 10, y: 20, s: 1.2, c: TEAL }, { x: 62, y: 58, s: 1, c: YELLOW }, { x: 80, y: -10, s: 0.9, c: BLUE }] },
  { id: "weigh", label: "Weigh", caption: ["It", "weighs itself", ", around the clock."], blobs: [{ x: 30, y: 40, s: 1.5, c: GREEN }, { x: 70, y: 10, s: 0.8, c: YELLOW }, { x: -5, y: 70, s: 1, c: BLUE }] },
  { id: "call", label: "Call", caption: ["Full? It", "calls a pickup", "on its own."], blobs: [{ x: 75, y: 30, s: 1.2, c: TEAL }, { x: 5, y: 15, s: 1, c: YELLOW, o: 0.7 }, { x: 45, y: 75, s: 1.1, c: BLUE }] },
  { id: "route", label: "Collect", caption: ["The", "nearest driver", "is already on the way."], blobs: [{ x: 50, y: 50, s: 1.6, c: GREEN, o: 0.7 }, { x: 85, y: 70, s: 0.8, c: YELLOW }, { x: 10, y: 0, s: 1, c: BLUE }] },
  { id: "pay", label: "Pay", caption: ["Track it.", "Pay by UPI.", "Done."], blobs: [{ x: 20, y: 60, s: 1.1, c: BLUE }, { x: 70, y: 30, s: 1.3, c: TEAL }, { x: 90, y: 80, s: 0.8, c: YELLOW }] },
  { id: "start", label: "Start", caption: ["Laundry, on", "autopilot", "."], blobs: [{ x: 50, y: 40, s: 1.7, c: VIOLET }, { x: 15, y: 70, s: 1, c: TEAL }, { x: 85, y: 20, s: 1, c: YELLOW }] },
];

function Caption({ parts }: { parts: [string, string, string] }) {
  const [before, key, after] = parts;
  const words = before.split(" ").filter(Boolean);
  let i = 0;
  return (
    <p className="text-[clamp(1.35rem,3.4vw,2.6rem)] leading-tight font-semibold tracking-tight text-white drop-shadow-[0_2px_20px_rgb(0_0_0/0.6)]">
      {words.map((w) => (
        <span key={`b${i}`} className="mg-word mr-[0.28em]" style={{ animationDelay: `${150 + i++ * 110}ms` }}>
          {w}
        </span>
      ))}
      <span className="mg-key rounded-sm px-[0.08em]" style={{ animationDelay: `${150 + i++ * 110}ms, ${600 + i * 110}ms` }}>
        {key}
      </span>
      {after.startsWith(".") || after.startsWith(",") ? null : " "}
      {after
        .split(" ")
        .filter(Boolean)
        .map((w, k) => (
          <span key={`a${k}`} className="mg-word mr-[0.28em]" style={{ animationDelay: `${300 + (i + k) * 110}ms` }}>
            {w}
          </span>
        ))}
    </p>
  );
}

// ---------- scenes (all coordinates in a 400 × 225 viewBox) ----------

function SceneBasket() {
  // A small heap of clothes landing one by one inside the basket rim.
  const items = [
    { x: 182, y: 148, c: "#fb7185", d: 300, r: 16, rot: -12 },
    { x: 218, y: 150, c: "#38bdf8", d: 480, r: 14, rot: 16 },
    { x: 200, y: 132, c: "#facc15", d: 660, r: 15, rot: 4 },
    { x: 228, y: 128, c: "#a78bfa", d: 840, r: 12, rot: -22 },
    { x: 174, y: 124, c: "#34d399", d: 1020, r: 12, rot: 24 },
    { x: 204, y: 110, c: "#f97316", d: 1200, r: 12, rot: -6 },
  ];
  return (
    <svg viewBox="0 0 400 225" className="absolute inset-0 size-full">
      <ellipse cx="200" cy="128" rx="70" ry="70" fill="none" stroke="#facc15" strokeWidth="14" strokeLinecap="round" strokeDasharray="440" strokeDashoffset="440" className="mg-draw" style={{ filter: "drop-shadow(0 0 18px rgb(250 204 21 / 0.6))" }} />
      <ellipse cx="200" cy="128" rx="88" ry="88" fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="1" className="mg-orbit" strokeDasharray="4 10" />
      {items.map((it) => (
        <g key={it.d} className="mg-drop" style={{ animationDelay: `${it.d}ms`, transformBox: "fill-box", transformOrigin: "center" }}>
          <rect x={it.x - it.r} y={it.y - it.r * 0.7} width={it.r * 2} height={it.r * 1.4} rx={it.r * 0.5} fill={it.c} opacity="0.95" transform={`rotate(${it.rot} ${it.x} ${it.y})`} stroke="rgb(0 0 0 / 0.25)" strokeWidth="1" />
        </g>
      ))}

    </svg>
  );
}

function WeightCounter({ paused }: { paused: boolean }) {
  const el = useRef<HTMLSpanElement>(null);
  const t = useRef(0);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (!pausedRef.current) t.current += now - last;
      last = now;
      const p = Math.min(1, Math.max(0, (t.current - 500) / 2400));
      const eased = 1 - (1 - p) ** 3;
      if (el.current) el.current.textContent = (eased * 5).toFixed(1);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <span ref={el}>0.0</span>;
}

function SceneWeigh({ paused }: { paused: boolean }) {
  return (
    <>
      <svg viewBox="0 0 400 225" className="absolute inset-0 size-full">
        <defs>
          <linearGradient id="mg-gauge" x1="0" x2="1">
            <stop offset="0" stopColor="#facc15" />
            <stop offset="1" stopColor="#02a9a1" />
          </linearGradient>
        </defs>
        <circle cx="200" cy="120" r="96" fill="none" stroke="rgb(255 255 255 / 0.1)" className="mg-orbit" strokeDasharray="2 8" />
        <circle cx="200" cy="120" r="120" fill="none" stroke="rgb(255 255 255 / 0.06)" className="mg-orbit-rev" strokeDasharray="30 14" />
        <path d="M120 140 A80 80 0 0 1 280 140" fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="12" strokeLinecap="round" />
        <path d="M120 140 A80 80 0 0 1 280 140" fill="none" stroke="url(#mg-gauge)" strokeWidth="12" strokeLinecap="round" strokeDasharray="252" strokeDashoffset="252" className="mg-draw" style={{ animationDuration: "2.6s", animationDelay: "0.5s", filter: "drop-shadow(0 0 10px rgb(2 169 161 / 0.7))" }} />
        <circle r="5" fill="#fff" className="mg-pop" style={{ animationDelay: "3s" }} cx="280" cy="140" />
      </svg>
      <div className="absolute inset-x-0 top-[44%] -translate-y-1/2 text-center">
        <p className="text-[clamp(2rem,6vw,4rem)] leading-none font-semibold tabular-nums text-white">
          <WeightCounter paused={paused} />
          <span className="ml-1 text-[0.45em] text-white/60">kg</span>
        </p>
        <p className="mg-rise mt-2 text-xs tracking-[0.2em] text-[#5eead4] uppercase" style={{ animationDelay: "2.9s" }}>
          Target reached
        </p>
      </div>
    </>
  );
}

function SceneCall() {
  return (
    <>
      <div className="absolute top-[38%] left-[6%] h-1.5 w-[45%] origin-left rounded-full bg-gradient-to-r from-transparent via-[#fde68a] to-white mg-beam" style={{ boxShadow: "0 0 24px 6px rgb(250 204 21 / 0.55)", animationDelay: "0.3s", opacity: 0 }} />
      <div className="mg-pop absolute top-[33%] left-[5%] flex items-center gap-2 rounded-full bg-[#facc15] px-3 py-1.5 text-[clamp(0.75rem,1.6vw,1rem)] font-semibold text-[#1c1917] shadow-[0_0_40px_rgb(250_204_21/0.7)]">
        <span className="text-[1.4em] leading-none">🧺</span> 5.0 kg · full
      </div>
      <div className="mg-rise absolute top-[12%] right-[6%] w-[48%] max-w-[300px] rounded-2xl border border-white/15 bg-[#0e1621]/90 p-3 shadow-2xl backdrop-blur sm:p-4" style={{ animationDelay: "1.2s" }}>
        <div className="flex items-center gap-2 text-[11px] text-white/60">
          <span className="grid size-5 place-items-center rounded-full bg-[#2AABEE] text-[10px] text-white">✈</span> Toss Handy · now
        </div>
        <p className="mt-2 text-sm font-semibold text-white">🔔 NEW PICKUP · #104</p>
        <div className="mt-1 h-px bg-white/10" />
        <p className="mt-1.5 text-xs text-white/75">📍 C-12, Saket</p>
        <p className="text-xs text-white/75">⚖️ 5.0 kg · 🏁 deliver to Fresh</p>
        <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-[11px]">
          <span className="mg-pop rounded-lg bg-[#2AABEE]/25 py-1 text-center text-white" style={{ animationDelay: "2s" }}>🗺 Navigate</span>
          <span className="mg-pop rounded-lg bg-[#2AABEE]/25 py-1 text-center text-white" style={{ animationDelay: "2.15s" }}>✅ Picked up</span>
        </div>
      </div>
    </>
  );
}

function SceneRoute({ paused }: { paused: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (paused) svg.current?.pauseAnimations();
    else svg.current?.unpauseAnimations();
  }, [paused]);
  const path = "M50 170 C110 60 160 200 215 118 S320 40 350 74";
  return (
    <svg ref={svg} viewBox="0 0 400 225" className="absolute inset-0 size-full">
      {Array.from({ length: 8 }, (_, i) => (
        <line key={`v${i}`} x1={i * 57} x2={i * 57 + 30} y1="0" y2="225" stroke="rgb(255 255 255 / 0.04)" />
      ))}
      <path d={path} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="6" strokeLinecap="round" />
      <path d={path} fill="none" stroke="#5eead4" strokeWidth="4" strokeLinecap="round" strokeDasharray="420" strokeDashoffset="420" className="mg-draw" style={{ animationDuration: "2.4s", animationDelay: "0.3s", filter: "drop-shadow(0 0 8px rgb(94 234 212 / 0.8))" }} />
      <g className="mg-pop" style={{ animationDelay: "0.2s", transformBox: "fill-box", transformOrigin: "center" }}>
        <circle cx="50" cy="170" r="11" fill="#2563eb" />
        <text x="50" y="174" textAnchor="middle" fontSize="11">🚚</text>
      </g>
      <g className="mg-pop" style={{ animationDelay: "1.2s", transformBox: "fill-box", transformOrigin: "center" }}>
        <circle cx="215" cy="118" r="13" fill="#facc15" />
        <text x="215" y="123" textAnchor="middle" fontSize="13">🏠</text>
      </g>
      <g className="mg-pop" style={{ animationDelay: "2.2s", transformBox: "fill-box", transformOrigin: "center" }}>
        <circle cx="350" cy="74" r="14" fill="#02a9a1" />
        <text x="350" y="79" textAnchor="middle" fontSize="13">🏁</text>
      </g>
      <circle r="6" fill="#fff" style={{ filter: "drop-shadow(0 0 8px #fff)" }}>
        <animateMotion dur="2.4s" begin="0.3s" fill="freeze" path={path} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.65 0 0.35 1" />
      </circle>
    </svg>
  );
}

function ScenePay() {
  const apps = ["GPay", "PhonePe", "Paytm", "BHIM"];
  return (
    <>
      <svg viewBox="0 0 400 225" className="absolute inset-0 size-full opacity-60">
        <rect x="290" y="30" width="60" height="60" rx="8" fill="none" stroke="#facc15" strokeWidth="2" className="mg-spin" style={{ transformBox: "fill-box" }} />
      </svg>
      <div className="mg-rise absolute top-[10%] left-1/2 w-[46%] max-w-[300px] -translate-x-1/2 rounded-2xl bg-white p-3 text-[#111827] shadow-2xl sm:p-4" style={{ animationDelay: "0.4s" }}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold tracking-wide">INVOICE</span>
          <span className="text-[10px] text-gray-500">TOSS-2026-000104</span>
        </div>
        <div className="mt-2 space-y-1 text-[11px] text-gray-600">
          <div className="flex justify-between"><span>Laundry · 5.0 kg</span><span>₹500</span></div>
          <div className="flex justify-between text-emerald-600"><span>Welcome back −10%</span><span>−₹50</span></div>
        </div>
        <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 text-sm font-bold"><span>Total</span><span>₹450</span></div>
        <span className="mg-stamp absolute -right-3 -bottom-3 rounded-md border-2 border-emerald-500 bg-white px-2 py-0.5 text-sm font-extrabold tracking-widest text-emerald-600" style={{ animationDelay: "2.3s" }}>
          PAID
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-[30%] flex justify-center gap-2">
        {apps.map((a, i) => (
          <span key={a} className="mg-pop rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] text-white backdrop-blur" style={{ animationDelay: `${1.1 + i * 0.15}s` }}>
            {a}
          </span>
        ))}
      </div>
    </>
  );
}

function SceneStart() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <span className="mg-burst absolute size-40 rounded-full border-2 border-[#8b7bff]" />
      <span className="mg-burst absolute size-40 rounded-full border border-[#22d3ee]" style={{ animationDelay: "0.35s" }} />
      {/* Two wrappers: one animation each (a second class would override the first's animation). */}
      <div className="mg-pop relative w-[34%] max-w-[260px]" style={{ animationDelay: "0.2s" }}>
        <div className="mg-bob">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/toss-logo.png" alt="Toss" className="w-full drop-shadow-[0_0_40px_rgb(2_169_161/0.6)]" />
        </div>
      </div>
    </div>
  );
}

// ---------- stage ----------

export function HowMotion() {
  const [scene, setScene] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduce, setReduce] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const elapsed = useRef(0);
  const frozen = paused || hovering || !visible;
  const frozenRef = useRef(frozen);
  useEffect(() => {
    frozenRef.current = frozen;
  }, [frozen]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setReduce(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);

  useEffect(() => {
    if (!root.current) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(root.current);
    return () => io.disconnect();
  }, []);

  const go = useCallback((i: number) => {
    elapsed.current = 0;
    setScene((i + SCENES.length) % SCENES.length);
  }, []);

  // One clock drives the progress bar and scene changes, and it stops whenever the stage is frozen.
  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (!frozenRef.current) elapsed.current += now - last;
      last = now;
      if (bar.current) bar.current.style.transform = `scaleX(${Math.min(1, elapsed.current / SCENE_MS)})`;
      if (elapsed.current >= SCENE_MS) {
        elapsed.current = 0;
        setScene((s) => (s + 1) % SCENES.length);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce]);

  const s = SCENES[scene];

  if (reduce) {
    return (
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SCENES.map((sc, i) => (
          <li key={sc.id} className="glass rounded-2xl p-5">
            <p className="font-mono text-xs text-accent">0{i + 1} · {sc.label}</p>
            <p className="mt-2 text-lg font-medium">{sc.caption.join(" ").replace(" .", ".").replace(" ,", ",")}</p>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div ref={root} className="space-y-4">
      <div
        className={`relative aspect-[4/5] w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[#04060a] shadow-[0_40px_120px_-40px_rgb(2_169_161/0.45)] sm:aspect-video ${frozen ? "mg-paused" : ""}`}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onClick={() => setPaused((p) => !p)}
        role="img"
        data-frozen={paused ? "paused" : hovering ? "hover" : !visible ? "offscreen" : ""}
        aria-label={`How Toss works, step ${scene + 1} of ${SCENES.length}: ${s.caption.join(" ")}`}
      >
        {/* persistent glow blobs glide between scenes */}
        {s.blobs.map((b, i) => (
          <span
            key={i}
            className="mg-blob size-[55%]"
            style={{ background: b.c, opacity: b.o ?? 1, left: `${b.x}%`, top: `${b.y}%`, transform: `translate(-50%, -50%) scale(${b.s})` }}
          />
        ))}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_120%,transparent,rgb(4_6_10/0.65))]" />

        {/* scene layer: re-mounts on every scene so its animations play from the start */}
        <div key={scene} className="absolute inset-0">
          {s.id === "basket" && <SceneBasket />}
          {s.id === "weigh" && <SceneWeigh paused={frozen} />}
          {s.id === "call" && <SceneCall />}
          {s.id === "route" && <SceneRoute paused={frozen} />}
          {s.id === "pay" && <ScenePay />}
          {s.id === "start" && <SceneStart />}
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
            <Caption parts={s.caption} />
          </div>
        </div>

        <div className="pointer-events-none absolute top-4 right-5 left-5 flex items-center justify-between font-mono text-[11px] tracking-widest text-white/50">
          <span>TOSS · HOW IT WORKS</span>
          <span>
            0{scene + 1} / 0{SCENES.length}
          </span>
        </div>
        {frozen && visible && (paused || hovering) && (
          <span className="pointer-events-none absolute top-1/2 left-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-xl text-white backdrop-blur">
            {paused ? "▶" : "❚❚"}
          </span>
        )}
      </div>

      {/* stories-style progress: tap a step to jump to it */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Play" : "Pause"}
          className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-white/[0.04] text-sm text-secondary transition hover:text-fg"
        >
          {paused ? "▶" : "❚❚"}
        </button>
        <ol className="grid flex-1 grid-cols-6 gap-1.5">
          {SCENES.map((sc, i) => (
            <li key={sc.id}>
              <button type="button" onClick={() => go(i)} className="group block w-full text-left" aria-label={`Step ${i + 1}: ${sc.label}`} aria-current={i === scene ? "step" : undefined}>
                <span className="block h-1 overflow-hidden rounded-full bg-white/10">
                  <span
                    ref={i === scene ? bar : undefined}
                    className="block h-full origin-left rounded-full bg-gradient-to-r from-[#02a9a1] to-[#facc15]"
                    style={{ transform: i < scene ? "scaleX(1)" : "scaleX(0)" }}
                  />
                </span>
                <span className={`mt-1.5 block text-[11px] transition ${i === scene ? "text-fg" : "text-muted group-hover:text-secondary"}`}>
                  {sc.label}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
