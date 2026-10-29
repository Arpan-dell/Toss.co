"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import type { AssistantRole } from "@/lib/assistant/intents";
import type { TourStep } from "@/lib/guide/tours";
import { Mascot } from "./mascot";

// Tossy's guided tour. Each step opens its page if needed, waits for the thing it talks about to appear, scrolls it
// into view and puts a spotlight on it, with Tossy explaining it in a speech bubble next to it (a sheet on phones).
// Arrow keys or the buttons move along; Escape or ✕ ends it. Steps whose card isn't on screen (nothing in it today)
// are skipped, and a step with nothing to point at shows in the middle.

const SEEN = (role: AssistantRole) => `toss-guide:${role}`;
const PAD = 8; // spotlight padding around the target
const BUBBLE_W = 352;
const BUBBLE_H = 236; // room the bubble needs above or below its target
const WAIT_MS = 3000; // how long a step waits for its page and target to show up

/** Remember that this person has met Tossy, so the welcome doesn't pop up again on this device. */
export function markGuideSeen(role: AssistantRole) {
  try {
    localStorage.setItem(SEEN(role), "1");
  } catch {}
}

/** The first-visit hello beside the assistant button: "New here? I can show you around." */
export function GuideWelcome({ role, onStart }: { role: AssistantRole; onStart: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let seen = true;
    try {
      seen = !!localStorage.getItem(SEEN(role));
    } catch {}
    if (seen) return;
    const t = setTimeout(() => setShow(true), 1500); // let the page settle first
    return () => clearTimeout(t);
  }, [role]);
  if (!show) return null;
  const close = (go: boolean) => {
    markGuideSeen(role);
    setShow(false);
    if (go) onStart();
  };
  return (
    <div
      role="dialog"
      aria-labelledby="tossy-hello"
      className="tossy-hop fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-50 w-[min(19rem,calc(100vw-2rem))] rounded-2xl rounded-br-md border border-border bg-surface-solid p-4 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.55)] sm:right-6 sm:bottom-24"
    >
      <div className="flex gap-3">
        <Mascot size={44} talking />
        <div className="min-w-0">
          <p id="tossy-hello" className="text-sm font-semibold text-fg">
            Hi, I&apos;m Tossy!
          </p>
          <p className="mt-0.5 text-sm text-secondary">New here? I can show you around in two minutes.</p>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => close(false)} className="btn-ghost rounded-full px-3.5 py-1.5 text-xs text-secondary">
          Not now
        </button>
        <button type="button" onClick={() => close(true)} className="btn-primary rounded-full px-3.5 py-1.5 text-xs font-medium">
          Show me around
        </button>
      </div>
    </div>
  );
}

type Box = { x: number; y: number; w: number; h: number; vw: number; vh: number };

/** The first visible element for a step's target (see tours.ts for the forms a target takes). */
function findTarget(spec: string): Element | null {
  let found: Element[];
  if (spec.startsWith("heading:")) {
    const want = spec.slice("heading:".length).toLowerCase();
    found = [...document.querySelectorAll("main h1, main h2")]
      .filter((h) => (h.textContent ?? "").trim().toLowerCase().startsWith(want))
      // a page title points at its title block; a card heading at its whole card
      .map((h) => (h.tagName === "H1" ? h.parentElement : (h.closest("section") ?? h.parentElement)))
      .filter((e): e is HTMLElement => !!e);
  } else if (spec.startsWith("nav:")) {
    found = [...document.querySelectorAll(`nav[aria-label="Dashboard"] a[href="${CSS.escape(spec.slice("nav:".length))}"]`)];
  } else {
    found = [...document.querySelectorAll(spec)];
  }
  // the phone menu's links and the hidden dock are in the page too: only something actually on screen counts
  return found.find((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }) ?? null;
}

export function GuideTour({ steps, onEnd }: { steps: TourStep[]; onEnd: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  // the step whose target has been looked for, and what was found (null: show it in the middle)
  const [found, setFound] = useState<{ i: number; el: Element | null } | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  // the latest onEnd, so a parent re-render doesn't restart the search for the step's target
  const end = useRef(onEnd);
  useEffect(() => {
    end.current = onEnd;
  });
  const step = steps[i];

  const go = (d: 1 | -1) => {
    const n = i + d;
    if (n >= steps.length) return onEnd();
    if (n < 0) return;
    setDir(d);
    setI(n);
  };

  // open the step's page, then wait for its target
  useEffect(() => {
    if (!step) return;
    if (pathname !== step.path) {
      router.push(step.path);
      return; // runs again once the page has changed
    }
    let alive = true;
    const startedAt = performance.now();
    let timer: ReturnType<typeof setTimeout>;
    const look = () => {
      if (!alive) return;
      const el = step.target ? findTarget(step.target) : null;
      if (step.target && !el && performance.now() - startedAt < WAIT_MS) {
        timer = setTimeout(look, 120);
        return;
      }
      if (!el && step.optional) {
        // nothing to show here today: move on in the same direction
        const n = i + dir;
        if (n >= steps.length) return end.current();
        setI(Math.max(0, n));
        return;
      }
      if (el) {
        const tall = el.getBoundingClientRect().height > window.innerHeight * 0.6;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ block: tall ? "start" : "center", behavior: reduce ? "auto" : "smooth" });
      }
      setFound({ i, el });
    };
    timer = setTimeout(look, 60);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [step, i, dir, pathname, router, steps.length]);

  // keep the spotlight on its target while the page scrolls, resizes or reflows
  const el = found?.i === i ? found.el : null;
  useEffect(() => {
    if (found?.i !== i) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (!el) return setBox({ x: 0, y: 0, w: 0, h: 0, vw, vh });
        const r = el.getBoundingClientRect();
        setBox((b) => (b && b.x === r.x && b.y === r.y && b.w === r.width && b.h === r.height && b.vw === vw && b.vh === vh ? b : { x: r.x, y: r.y, w: r.width, h: r.height, vw, vh }));
      });
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true, capture: true });
    window.addEventListener("resize", measure);
    const ro = el ? new ResizeObserver(measure) : null;
    if (el) ro?.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [found, i, el]);

  const ready = found?.i === i && !!box;
  useEffect(() => {
    if (ready) nextBtn.current?.focus({ preventScroll: true });
  }, [ready, i]);

  // keyboard: → / Enter next, ← back, Escape ends the tour
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEnd();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!step) return null;

  // the spotlight, kept inside the screen for targets taller than it
  const spot =
    ready && el && box
      ? (() => {
          const top = Math.max(box.y - PAD, 6);
          const bottom = Math.min(box.y + box.h + PAD, box.vh - 6);
          return { x: box.x - PAD, y: top, w: box.w + PAD * 2, h: Math.max(bottom - top, 24) };
        })()
      : null;

  // where the bubble goes: under or over the spotlight, else beside it; a sheet on phones; the middle with no target
  let place: React.CSSProperties = {};
  let sheet = false;
  if (box && box.vw < 640) {
    sheet = true;
    place = spot && spot.y + spot.h / 2 > box.vh / 2 ? { top: 12 } : { bottom: 12 };
  } else if (spot && box) {
    const left = Math.min(Math.max(spot.x + spot.w / 2 - BUBBLE_W / 2, 12), box.vw - BUBBLE_W - 12);
    if (box.vh - (spot.y + spot.h) - 14 >= BUBBLE_H) place = { top: spot.y + spot.h + 14, left };
    else if (spot.y - 14 >= BUBBLE_H) place = { bottom: box.vh - spot.y + 14, left };
    else if (spot.x + spot.w + 14 + BUBBLE_W <= box.vw) place = { left: spot.x + spot.w + 14, top: Math.min(Math.max(spot.y, 12), box.vh - BUBBLE_H) };
    else if (spot.x - 14 - BUBBLE_W >= 0) place = { left: spot.x - 14 - BUBBLE_W, top: Math.min(Math.max(spot.y, 12), box.vh - BUBBLE_H) };
    else place = { bottom: 16, left: (box.vw - BUBBLE_W) / 2 };
  } else if (box) {
    place = { top: Math.max((box.vh - BUBBLE_H) / 2, 12), left: (box.vw - BUBBLE_W) / 2 };
  }

  const last = i === steps.length - 1;
  return (
    <div className="fixed inset-0 z-[60]">
      {/* the dimmed page (clicks on it do nothing, so the tour can't be lost mid-way) */}
      {spot ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-[14px] outline-2 outline-accent motion-safe:transition-[left,top,width,height] motion-safe:duration-300"
          style={{ left: spot.x, top: spot.y, width: spot.w, height: spot.h, boxShadow: "0 0 0 200vmax rgb(0 0 0 / 0.55)" }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-black/55" />
      )}

      {ready && (
        <div
          key={i}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tossy-step-title"
          aria-describedby="tossy-step-text"
          style={sheet ? place : { ...place, width: BUBBLE_W }}
          className={`tossy-hop fixed rounded-2xl border border-border bg-surface-solid p-4 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6)] ${sheet ? "inset-x-3" : ""}`}
        >
          <div className="flex gap-3">
            <Mascot size={52} talking />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
                Tossy · {i + 1} of {steps.length}
              </p>
              <p id="tossy-step-title" className="mt-0.5 text-[15px] font-semibold text-fg">
                {step.title}
              </p>
            </div>
            <button type="button" onClick={onEnd} aria-label="End the tour" className="btn-ghost grid size-8 shrink-0 place-items-center self-start rounded-full text-muted">
              <X size={14} weight="bold" />
            </button>
          </div>
          <p id="tossy-step-text" aria-live="polite" className="mt-2.5 text-sm leading-relaxed text-secondary">
            {step.text}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <div aria-hidden className="mr-auto h-1 w-20 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full bg-accent" style={{ width: `${((i + 1) / steps.length) * 100}%` }} />
            </div>
            {i > 0 && (
              <button type="button" onClick={() => go(-1)} className="btn-ghost rounded-full px-3.5 py-1.5 text-xs text-secondary">
                Back
              </button>
            )}
            <button ref={nextBtn} type="button" onClick={() => go(1)} className="btn-primary rounded-full px-4 py-1.5 text-xs font-medium">
              {last ? "Done" : i === 0 && steps.length > 1 ? "Let's go" : "Next"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
