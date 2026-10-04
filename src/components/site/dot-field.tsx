"use client";

import { useEffect, useRef } from "react";

// A grid of dots with a ripple travelling out from a point (the orbit's centre), the way a dropped load sends a
// wave through the basket. Dots on the crest grow and take the accent colour. Canvas 2D: positions are laid out
// once per resize, dots are drawn in a few batched paths per frame (one per shade), at most 30 fps, capped at
// 2x pixel ratio. It stops when off-screen or when the tab is hidden, and holds still for reduced motion.
// Colours come from the theme tokens and follow theme switches.
const GAP = 24;
const SHADES = 6; // ink alpha steps; crest dots go to the accent path
const FRAME_MS = 1000 / 30;

export function DotField({ originX = 0.72, originY = 0.5, className = "" }: { originX?: number; originY?: number; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let xs = new Float32Array(0);
    let ys = new Float32Array(0);
    let ink = "255 255 255";
    let accent = "255 106 31";
    const readColours = () => {
      const css = getComputedStyle(el);
      ink = css.getPropertyValue("--ink-rgb").trim() || ink;
      accent = css.getPropertyValue("--accent-rgb").trim() || accent;
    };
    const layout = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cols = Math.ceil(w / GAP);
      const rows = Math.ceil(h / GAP);
      xs = new Float32Array(cols * rows);
      ys = new Float32Array(cols * rows);
      let k = 0;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++, k++) {
          xs[k] = c * GAP + GAP / 2;
          ys[k] = r * GAP + GAP / 2;
        }
    };

    // the wave source eases toward the pointer a little, so the field feels alive under the cursor
    let ox = originX;
    let oy = originY;
    let tx = ox;
    let ty = oy;
    const onPointer = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      tx = originX + ((e.clientX - r.left) / r.width - originX) * 0.25;
      ty = originY + ((e.clientY - r.top) / r.height - originY) * 0.25;
    };

    const paths: Path2D[] = [];
    const draw = (t: number) => {
      ox += (tx - ox) * 0.08;
      oy += (ty - oy) * 0.08;
      ctx.clearRect(0, 0, w, h);
      const cx = ox * w;
      const cy = oy * h;
      const reach = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
      for (let s = 0; s <= SHADES; s++) paths[s] = new Path2D();
      const phase = t * 0.0021;
      for (let k = 0; k < xs.length; k++) {
        const dx = xs[k] - cx;
        const dy = ys[k] - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        const crest = Math.max(0, Math.sin(d * 0.03 - phase)); // 0..1, rolling outward
        const fade = 1 - (d / reach) * 0.55;
        const r = 0.7 + crest * crest * 1.9;
        // shade 0..SHADES-1 = ink at rising alpha, SHADES = accent (the crest)
        const s = crest > 0.82 ? SHADES : Math.min(SHADES - 1, Math.floor((0.07 + crest * 0.16) * fade * SHADES * 4.2));
        const p = paths[s];
        // at under ~1.3px a square is indistinguishable from a circle and far cheaper to rasterise
        if (r < 1.3) p.rect(xs[k] - r, ys[k] - r, r * 2, r * 2);
        else {
          p.moveTo(xs[k] + r, ys[k]);
          p.arc(xs[k], ys[k], r, 0, Math.PI * 2);
        }
      }
      for (let s = 0; s < SHADES; s++) {
        ctx.fillStyle = `rgb(${ink} / ${(s + 0.6) / (SHADES * 4.2)})`;
        ctx.fill(paths[s]);
      }
      ctx.fillStyle = `rgb(${accent} / 0.7)`;
      ctx.fill(paths[SHADES]);
    };

    let raf = 0;
    let last = 0;
    let running = false;
    const loop = (t: number) => {
      if (t - last >= FRAME_MS) {
        last = t;
        draw(t);
      }
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running || reduce) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    readColours();
    layout();
    draw(1800); // a settled first frame (also the only frame for reduced motion)

    const ro = new ResizeObserver(() => {
      layout();
      if (!running) draw(1800);
    });
    ro.observe(el);
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !document.hidden) start();
      else stop();
    });
    io.observe(el);
    const onVisibility = () => (document.hidden || !visible ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    // theme switch: re-read the tokens
    const mo = new MutationObserver(() => {
      readColours();
      if (!running) draw(1800);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("pointermove", onPointer, { passive: true });

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
    };
  }, [originX, originY]);

  return <canvas ref={canvas} aria-hidden className={`pointer-events-none block h-full w-full ${className}`} />;
}
