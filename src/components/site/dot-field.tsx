"use client";

import { useEffect, useRef } from "react";

// A grid of dots with rings spreading out from a point (the orbit's centre), the way a dropped load sends a wave
// through the basket. Dots on a crest are larger and take the accent colour. Drawn once (and again on resize or a
// theme switch), never animated: the moving version kept the first screen busy on phones. Canvas 2D, dots batched
// into a few paths (one per shade), capped at 2x pixel ratio. Colours come from the theme tokens.
const GAP = 24;
const SHADES = 6; // ink alpha steps; crest dots go to the accent path
const PHASE = 3.8; // where the rings sit (the settled look of the old animation)

export function DotField({ originX = 0.72, originY = 0.5, className = "" }: { originX?: number; originY?: number; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;

    const draw = () => {
      const css = getComputedStyle(el);
      const ink = css.getPropertyValue("--ink-rgb").trim() || "255 255 255";
      const accent = css.getPropertyValue("--accent-rgb").trim() || "255 106 31";
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = el.clientWidth;
      const h = el.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cx = originX * w;
      const cy = originY * h;
      const reach = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
      const paths = Array.from({ length: SHADES + 1 }, () => new Path2D());
      for (let y = GAP / 2; y < h; y += GAP)
        for (let x = GAP / 2; x < w; x += GAP) {
          const d = Math.hypot(x - cx, y - cy);
          const crest = Math.max(0, Math.sin(d * 0.03 - PHASE)); // 0..1
          const fade = 1 - (d / reach) * 0.55;
          const r = 0.7 + crest * crest * 1.9;
          // shade 0..SHADES-1 = ink at rising alpha, SHADES = accent (the crest)
          const s = crest > 0.82 ? SHADES : Math.min(SHADES - 1, Math.floor((0.07 + crest * 0.16) * fade * SHADES * 4.2));
          if (r < 1.3) paths[s].rect(x - r, y - r, r * 2, r * 2);
          else {
            paths[s].moveTo(x + r, y);
            paths[s].arc(x, y, r, 0, Math.PI * 2);
          }
        }
      for (let s = 0; s < SHADES; s++) {
        ctx.fillStyle = `rgb(${ink} / ${(s + 0.6) / (SHADES * 4.2)})`;
        ctx.fill(paths[s]);
      }
      ctx.fillStyle = `rgb(${accent} / 0.7)`;
      ctx.fill(paths[SHADES]);
    };

    draw();
    let last = `${el.clientWidth}x${el.clientHeight}`;
    const ro = new ResizeObserver(() => {
      const size = `${el.clientWidth}x${el.clientHeight}`;
      if (size !== last) {
        last = size;
        draw();
      }
    });
    ro.observe(el);
    const mo = new MutationObserver(draw); // theme switch
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [originX, originY]);

  return <canvas ref={canvas} aria-hidden className={`pointer-events-none block h-full w-full ${className}`} />;
}
