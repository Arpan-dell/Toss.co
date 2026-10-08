"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useCapable3D } from "@/lib/use-capable-3d";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import type { Pose } from "./basket-scene";

// The 3D Toss box for the order form: the same model as the scroll story, in the chosen filament colour.
// It turns slowly on its own, can be dragged round, and has quick views (angle, front, USB-C side, top).
const BasketScene = dynamic(() => import("./basket-scene"), { ssr: false, loading: () => <div className="size-full" /> });

// photo: the real product photo for that view, used on phones and budget devices instead of the 3D model
const VIEWS = [
  { id: "angle", label: "Angle", pose: { ry: -0.62, t: 0.32 }, photo: "hero" },
  { id: "front", label: "Front", pose: { ry: 0, t: 0.1 }, photo: "front" },
  { id: "port", label: "USB-C side", pose: { ry: -Math.PI / 2, t: 0.1 }, photo: "side" },
  { id: "top", label: "Top", pose: { ry: 0, t: 1.2 }, photo: "top" },
] as const;

export function BasketViewer({ color }: { color: string }) {
  const box = useRef<HTMLDivElement>(null);
  const pose = useRef<Pose>({ ...VIEWS[0].pose });
  const spinning = useRef(true);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [view, setView] = useState<(typeof VIEWS)[number]["id"] | null>("angle");
  const [near, setNear] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const reduce = useReducedMotion();
  const capable = useCapable3D();

  // three.js starts when the viewer is actually on screen (loading it ahead froze the page just before);
  // frames are drawn only while it's visible. Phones and budget devices get photos instead.
  useEffect(() => {
    const el = box.current;
    if (!el || !capable) return;
    const ahead = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: "0px 0px -20% 0px" });
    const vis = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    ahead.observe(el);
    vis.observe(el);
    return () => {
      ahead.disconnect();
      vis.disconnect();
    };
  }, [capable]);

  // idle spin (a ref, not state: no re-renders)
  useEffect(() => {
    if (reduce || !onScreen) return;
    let last = performance.now();
    let id = 0;
    const tick = (now: number) => {
      if (spinning.current && !drag.current) pose.current.ry += ((now - last) / 1000) * 0.35;
      last = now;
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [reduce, onScreen]);

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
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        role="img"
        aria-label="3D model of the Toss basket box. Drag to turn it."
      >
        {!capable ? (
          <Image
            src={`/brand/basket/${VIEWS.find((v) => v.id === view)?.photo ?? "hero"}-${color}.webp`}
            alt=""
            fill
            sizes="(min-width: 1024px) 480px, 90vw"
            className="object-contain p-6"
          />
        ) : (
          near && (
            <div className="size-full">
              <BasketScene color={color} pose={pose} active={onScreen} near />
            </div>
          )
        )}
        {capable && <span className="pointer-events-none absolute bottom-3 left-3 font-mono text-[10px] tracking-[0.12em] text-muted uppercase">Drag to turn</span>}
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
