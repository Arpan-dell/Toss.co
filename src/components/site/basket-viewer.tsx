"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCapable3D } from "@/lib/use-capable-3d";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { colorOf, type BasketColor } from "./basket-colors";
import type { Pose } from "./basket-scene";

// The 3D Toss box for the order form: the same model as the scroll story, in the chosen filament colour.
// It turns slowly on its own, can be dragged round, and has quick views (angle, front, USB-C side, top).
const BasketScene = dynamic(() => import("./basket-scene"), { ssr: false, loading: () => <div className="size-full" /> });

// Phones and budget devices get no three.js. The Angle view is a turntable instead: 72 frames of one full turn
// rendered from this same model (public/brand/basket/turn/<colour>/00-71.webp), swapped as it spins or is dragged.
// Frames load once the viewer is near, every 6th first so it turns straight away, then the rest; until a frame has
// arrived the nearest loaded one is shown. The other views are stills from the same model
// (public/brand/basket/render-<id>-<colour>.webp), so everything matches the 3D exactly.
const VIEWS = [
  { id: "angle", label: "Angle", pose: { ry: -0.62, t: 0.32 } },
  { id: "front", label: "Front", pose: { ry: 0, t: 0.1 } },
  { id: "port", label: "USB-C side", pose: { ry: -Math.PI / 2, t: 0.1 } },
  { id: "top", label: "Top", pose: { ry: 0, t: 1.2 } },
] as const;
const TURN_FRAMES = 72;
const STEP = (Math.PI * 2) / TURN_FRAMES;
const turnSrc = (color: BasketColor, i: number) => `/brand/basket/turn/${color}/${String(i).padStart(2, "0")}.webp`;

export function BasketViewer({ color }: { color: BasketColor }) {
  const box = useRef<HTMLDivElement>(null);
  const pose = useRef<Pose>({ ...VIEWS[0].pose });
  const spinning = useRef(true);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [view, setView] = useState<(typeof VIEWS)[number]["id"] | null>("angle");
  const [near, setNear] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const reduce = useReducedMotion();
  const capable = useCapable3D();
  const turnImg = useRef<HTMLImageElement>(null);
  const loaded = useRef<Set<number>>(new Set([0]));

  // phones: show the turntable frame for the current angle (the nearest one that has loaded)
  const showFrame = useCallback(() => {
    const el = turnImg.current;
    if (!el) return;
    const want = (((Math.round((pose.current.ry - VIEWS[0].pose.ry) / STEP) % TURN_FRAMES) + TURN_FRAMES) % TURN_FRAMES);
    let best = 0;
    let gap = Infinity;
    for (const i of loaded.current) {
      const d = Math.min(Math.abs(i - want), TURN_FRAMES - Math.abs(i - want));
      if (d < gap) [gap, best] = [d, i];
    }
    const next = turnSrc(color, best);
    if (el.dataset.frame !== next) {
      el.src = next;
      el.dataset.frame = next;
    }
  }, [color]);

  // three.js (or, on phones, the turntable frames) starts loading when the viewer is actually near the screen
  // (loading it ahead froze the page just before); it animates only while it's visible.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // three.js waits until the viewer is well in view; the light turntable frames start a screen ahead
    const ahead = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: capable ? "0px 0px -20% 0px" : "100% 0px" });
    const vis = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    ahead.observe(el);
    vis.observe(el);
    return () => {
      ahead.disconnect();
      vis.disconnect();
    };
  }, [capable]);

  // phones: fetch the turntable frames for this colour, a few at a time
  useEffect(() => {
    loaded.current = new Set([0]);
    showFrame();
    if (capable || !near) return;
    let cancelled = false;
    const all = Array.from({ length: TURN_FRAMES }, (_, i) => i);
    const order = [...all.filter((i) => i % 6 === 0), ...all.filter((i) => i % 6 !== 0)];
    const fetchFrame = (i: number) =>
      new Promise<void>((resolve) => {
        const im = new window.Image();
        im.decoding = "async";
        im.onload = () => {
          if (!cancelled) {
            loaded.current.add(i);
            showFrame();
          }
          resolve();
        };
        im.onerror = () => resolve();
        im.src = turnSrc(color, i);
      });
    (async () => {
      for (let k = 0; k < order.length && !cancelled; k += 6) await Promise.all(order.slice(k, k + 6).map(fetchFrame));
    })();
    return () => {
      cancelled = true;
    };
  }, [capable, near, color, showFrame]);

  // idle spin (a ref, not state: no re-renders)
  useEffect(() => {
    if (reduce || !onScreen) return;
    let last = performance.now();
    let id = 0;
    // the turntable turns a little faster (one turn in ~9 s) so its 5° steps read as motion, not a slideshow
    const speed = capable ? 0.35 : 0.7;
    const tick = (now: number) => {
      if (spinning.current && !drag.current) {
        pose.current.ry += ((now - last) / 1000) * speed;
        if (!capable) showFrame();
      }
      last = now;
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [reduce, onScreen, capable, showFrame]);

  const show = (v: (typeof VIEWS)[number]) => {
    spinning.current = v.id === "angle";
    // take the shortest way round to the requested angle
    const turns = Math.round((pose.current.ry - v.pose.ry) / (Math.PI * 2));
    pose.current = { ry: v.pose.ry + turns * Math.PI * 2, t: v.pose.t };
    setView(v.id);
  };

  return (
    <div>
      <div
        ref={box}
        className="relative aspect-[4/3] cursor-grab touch-pan-y overflow-hidden rounded-[10px] border border-border bg-[radial-gradient(ellipse_at_50%_60%,rgb(var(--accent-rgb)/0.08),transparent_70%)] active:cursor-grabbing"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY };
          spinning.current = false;
          setView(null);
          (e.target as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          pose.current.ry += (e.clientX - drag.current.x) * 0.012;
          pose.current.t = Math.min(1.3, Math.max(-0.1, pose.current.t + (e.clientY - drag.current.y) * 0.006));
          drag.current = { x: e.clientX, y: e.clientY };
          if (!capable) showFrame();
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        role="img"
        aria-label="3D model of the Toss basket box. Drag to turn it."
      >
        {!capable ? (
          view && view !== "angle" ? (
            <Image src={`/brand/basket/render-${view}-${color}.webp`} alt="" fill sizes="(min-width: 1024px) 480px, 90vw" draggable={false} className="pointer-events-none object-contain p-6" />
          ) : (
            <>
              {/* the floor shadow is drawn here, not in the frames: soft gradients band when compressed with transparency */}
              <div aria-hidden className="absolute inset-x-[16%] top-[80%] h-[12%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(0_0_0/0.25),transparent)] blur-md" />
              {/* eslint-disable-next-line @next/next/no-img-element -- frames are swapped by hand as it turns; next/image would re-render each */}
              <img ref={turnImg} src={turnSrc(color, 0)} data-frame={turnSrc(color, 0)} alt="" width={640} height={480} decoding="async" draggable={false} className="pointer-events-none absolute inset-0 size-full object-contain p-4" />
            </>
          )
        ) : (
          near && (
            <div className="size-full">
              <BasketScene color={colorOf(color).hex} pose={pose} active={onScreen} near />
            </div>
          )
        )}
        {(capable || !view || view === "angle") && <span className="pointer-events-none absolute bottom-3 left-3 font-mono text-[10px] tracking-[0.12em] text-muted uppercase">Drag to turn</span>}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label="Views">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => show(v)}
            aria-pressed={view === v.id}
            className={`rounded-[8px] border px-2 py-2.5 font-mono text-[11px] tracking-[0.08em] uppercase transition-colors ${
              view === v.id ? "border-fg text-fg" : "border-border text-muted hover:border-border-strong hover:text-fg"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}
