"use client";

import { useEffect, useRef } from "react";

// A grid of dots with a heartbeat: every BEAT_MS a double pulse ("lub-dub") ripples out from a point (the orbit's
// centre), lighting the dots it passes in the accent colour. Cheap by construction: the faint grid is drawn once to
// an offscreen canvas, and a frame only copies it and redraws the dots inside the travelling rings. It draws only
// while a ring is moving (nothing between beats), at most 30 fps, never while the page is scrolling, and not at all
// off-screen, in a hidden tab or with reduced motion (one still frame). Colours come from the theme tokens.
const GAP = 24;
const BEAT_MS = 1700; // one heartbeat (~35 bpm reads calm, not alarming)
const DUB_MS = 230; // the second pulse follows the first
const SPEED = 0.62; // ring speed, px per ms
const BAND = 46; // ring thickness, px
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
    let dpr = 1;
    let cx = 0;
    let cy = 0;
    let reach = 1;
    let xs = new Float32Array(0);
    let ys = new Float32Array(0);
    let ds = new Float32Array(0); // each dot's distance from the centre
    let ink = "255 255 255";
    let accent = "255 106 31";
    const base = document.createElement("canvas");

    const readColours = () => {
      const css = getComputedStyle(el);
      ink = css.getPropertyValue("--ink-rgb").trim() || ink;
      accent = css.getPropertyValue("--accent-rgb").trim() || accent;
    };

    // the still grid: faint dots, a little brighter towards the centre
    const layout = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = base.width = Math.round(w * dpr);
      el.height = base.height = Math.round(h * dpr);
      cx = originX * w;
      cy = originY * h;
      reach = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
      const n = Math.ceil(w / GAP) * Math.ceil(h / GAP);
      xs = new Float32Array(n);
      ys = new Float32Array(n);
      ds = new Float32Array(n);
      let k = 0;
      for (let y = GAP / 2; y < h; y += GAP)
        for (let x = GAP / 2; x < w; x += GAP, k++) {
          xs[k] = x;
          ys[k] = y;
          ds[k] = Math.hypot(x - cx, y - cy);
        }
      const g = base.getContext("2d")!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const shades = [new Path2D(), new Path2D(), new Path2D()];
      for (let i = 0; i < k; i++) shades[Math.min(2, Math.floor((1 - ds[i] / reach) * 3))].rect(xs[i] - 0.8, ys[i] - 0.8, 1.6, 1.6);
      shades.forEach((p, s) => {
        g.fillStyle = `rgb(${ink} / ${0.05 + s * 0.035})`;
        g.fill(p);
      });
    };

    // one frame: the grid, plus the dots inside each ring that is still travelling
    const draw = (now: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.drawImage(base, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const into = now % BEAT_MS;
      const rings = [into * SPEED, (into - DUB_MS) * SPEED * 0.92].filter((r) => r > -BAND && r < reach + BAND);
      if (!rings.length) return false;
      const glow = new Path2D();
      const soft = new Path2D();
      for (let i = 0; i < ds.length; i++) {
        let crest = 0;
        for (let j = 0; j < rings.length; j++) {
          const off = Math.abs(ds[i] - rings[j]);
          if (off < BAND) crest = Math.max(crest, (1 - off / BAND) * (j === 0 ? 1 : 0.7));
        }
        if (crest <= 0) continue;
        crest *= 1 - (ds[i] / reach) * 0.6; // fades as it travels out
        const r = 0.8 + crest * crest * 2.2;
        const p = crest > 0.5 ? glow : soft;
        p.moveTo(xs[i] + r, ys[i]);
        p.arc(xs[i], ys[i], r, 0, Math.PI * 2);
      }
      ctx.fillStyle = `rgb(${accent} / 0.38)`;
      ctx.fill(soft);
      ctx.fillStyle = `rgb(${accent} / 0.8)`;
      ctx.fill(glow);
      return true;
    };

    readColours();
    layout();
    draw(BEAT_MS * 0.35); // a still frame mid-beat (the only one with reduced motion)

    let raf = 0;
    let last = 0;
    let running = false;
    let scrolledAt = 0;
    let quiet = false; // between beats nothing moves: the grid is already on screen
    const onScroll = () => (scrolledAt = performance.now());
    const loop = (t: number) => {
      if (t - last >= FRAME_MS && t - scrolledAt > 160) {
        last = t;
        const moving = (t % BEAT_MS) * SPEED < reach + BAND * 2 || ((t % BEAT_MS) - DUB_MS) * SPEED < reach + BAND * 2;
        if (moving) {
          draw(t);
          quiet = false;
        } else if (!quiet) {
          draw(t);
          quiet = true;
        }
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

    let size = `${el.clientWidth}x${el.clientHeight}`;
    const ro = new ResizeObserver(() => {
      const next = `${el.clientWidth}x${el.clientHeight}`;
      if (next === size) return;
      size = next;
      layout();
      draw(BEAT_MS * 0.35);
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
    // theme switch: re-read the tokens and redraw the grid
    const mo = new MutationObserver(() => {
      readColours();
      layout();
      draw(BEAT_MS * 0.35);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("scroll", onScroll);
    };
  }, [originX, originY]);

  return <canvas ref={canvas} aria-hidden className={`pointer-events-none block h-full w-full ${className}`} />;
}
