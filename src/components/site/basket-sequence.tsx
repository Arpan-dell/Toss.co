"use client";

import { useEffect, useRef } from "react";
import { useMotionValueEvent, type MotionValue } from "framer-motion";
import type { BasketColor } from "./basket-colors";

// Phones and budget devices: the basket's scroll story as frames pre-rendered from the same 3D model
// (public/brand/basket/seq/<colour>/00-47.webp), swapped as you scroll, like a flip-book. It looks like the
// live 3D animation without three.js or WebGL on the device. Frames download once the section is near: every
// 6th frame first so the motion works straight away, then the rest fill in. Until a frame has arrived, the
// nearest one that has is shown, so it never blanks.
export const SEQ_FRAMES = 48;
const src = (color: BasketColor, i: number) => `/brand/basket/seq/${color}/${String(i).padStart(2, "0")}.webp`;

export function BasketSequence({ color, progress, load }: { color: BasketColor; progress: MotionValue<number>; load: boolean }) {
  const img = useRef<HTMLImageElement>(null);
  const ready = useRef<Set<number>>(new Set());

  const show = (p: number) => {
    const want = Math.round(Math.min(1, Math.max(0, p)) * (SEQ_FRAMES - 1));
    let best = 0;
    let gap = Infinity;
    for (const i of ready.current) {
      const d = Math.abs(i - want);
      if (d < gap) [gap, best] = [d, i];
    }
    const el = img.current;
    const next = src(color, best);
    if (el && el.dataset.frame !== next) {
      el.src = next;
      el.dataset.frame = next;
    }
  };

  useEffect(() => {
    ready.current = new Set([0]);
    show(progress.get());
    if (!load) return;
    let cancelled = false;
    const keys = Array.from({ length: SEQ_FRAMES }, (_, i) => i).filter((i) => i % 6 === 0);
    const rest = Array.from({ length: SEQ_FRAMES }, (_, i) => i).filter((i) => i % 6 !== 0);
    const fetchFrame = (i: number) =>
      new Promise<void>((resolve) => {
        const im = new Image();
        im.decoding = "async";
        im.onload = () => {
          if (!cancelled) {
            ready.current.add(i);
            show(progress.get());
          }
          resolve();
        };
        im.onerror = () => resolve();
        im.src = src(color, i);
      });
    (async () => {
      // a few at a time: quick on a phone connection without flooding it
      for (const batch of [keys, rest]) {
        for (let k = 0; k < batch.length && !cancelled; k += 6) await Promise.all(batch.slice(k, k + 6).map(fetchFrame));
      }
    })();
    return () => {
      cancelled = true;
    };
    // show() reads refs only; re-run when the colour or loading switch changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, load, progress]);

  useMotionValueEvent(progress, "change", show);

  return (
    <div className="relative mx-auto h-full w-fit max-w-full">
      {/* the floor shadow is drawn here, not in the frames: soft gradients band when compressed with transparency */}
      <div aria-hidden className="absolute inset-x-[14%] top-[64%] h-[12%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(0_0_0/0.22),transparent)] blur-md" />
      {/* eslint-disable-next-line @next/next/no-img-element -- frames are swapped by hand on scroll; next/image would re-render each */}
      <img ref={img} src={src(color, 0)} data-frame={src(color, 0)} alt="" width={480} height={600} decoding="async" className="relative h-full w-auto max-w-full object-contain" />
    </div>
  );
}
