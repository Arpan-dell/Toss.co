"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useCapable3D } from "@/lib/use-capable-3d";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { BASKET_COLORS, colorOf, type BasketColor } from "./basket-colors";
import { useBasketColor } from "./basket-color-store";

// Scroll story of the Toss basket box. A tall runway pins a full-screen stage; as you scroll the 3D box
// rotates and slides between the halves of the screen while each feature's text fades in on the other side.
// The 3D scene loads only once this section is reached (three.js is heavy); phones see renders of it instead.

const BasketScene = dynamic(() => import("./basket-scene"), {
  ssr: false,
  loading: () => <ModelPlaceholder />,
});

// While three.js loads: a soft glow where the box will sit, not the real photo (which flashed in and then
// jumped to the 3D model on every refresh). The model fades in over it.
function ModelPlaceholder() {
  return (
    <div aria-hidden className="grid h-full place-items-center">
      <div className="size-[min(46vw,360px)] animate-pulse rounded-full bg-accent/[0.07] blur-3xl" />
    </div>
  );
}

// Phones and budget devices: a picture rendered from the same 3D model (public/brand/basket/render-*), so it looks
// exactly like the desktop model without loading three.js. It drifts and turns a little with the scroll using
// transforms only, done off the main thread.
function BasketPoster({ color, progress }: { color: BasketColor; progress: MotionValue<number> }) {
  const rotate = useTransform(progress, [0, 1], [-6, 8]);
  const scale = useTransform(progress, [0, 0.5, 1], [0.92, 1.04, 0.96]);
  const y = useTransform(progress, [0, 1], ["2%", "-3%"]);
  return (
    <motion.div
      aria-hidden
      style={{ rotate, scale, y }}
      className="grid h-full place-items-center"
    >
      <Image
        src={`/brand/basket/render-angle-${color}.webp`}
        alt=""
        width={820}
        height={482}
        priority
        sizes="(min-width: 1024px) 560px, 80vw"
        className="h-auto w-[min(80vw,560px)] drop-shadow-[0_30px_40px_rgb(0_0_0/0.25)]"
      />
    </motion.div>
  );
}

type Step = { at: [number, number]; side: "left" | "right" | "center"; kicker: string; title: string; body: React.ReactNode; swatches?: boolean };

const STEPS: Step[] = [
  {
    at: [0, 0.15],
    side: "left",
    kicker: "The Toss basket",
    title: "A small box that makes any laundry basket smart.",
    body: "It weighs your clothes as they pile up and calls the pickup by itself when the basket is full.",
    swatches: true,
  },
  {
    at: [0.19, 0.34],
    side: "left",
    kicker: "01 · Low cost",
    title: "Low cost, made to be printed.",
    body: "A 3D-printed shell around a load cell and a small Wi-Fi chip. Nothing to install, nothing to subscribe to, and it's printed in whatever colour suits your room.",
    swatches: true,
  },
  {
    at: [0.38, 0.54],
    side: "right",
    kicker: "02 · Universal charging",
    title: "One USB-C port. Any wall charger.",
    body: "Plug it into the phone charger you already have and mount the charger on the wall. No batteries to swap.",
  },
  {
    at: [0.58, 0.75],
    side: "left",
    kicker: "03 · Fits your basket",
    title: "It goes under the basket you already own.",
    body: "Put the Toss box at the bottom of your laundry basket and lay the false plate over it. Clothes rest on the plate; the plate rests on the scale.",
  },
  {
    at: [0.79, 1],
    side: "left",
    kicker: "04 · Tare from your phone",
    title: "Zero it from Telegram.",
    body: (
      <>
        Tap <b>🔄 Tare</b> in Toss Control with the basket empty. The basket and plate now read 0.0 kg, so only your clothes count.
        <span className="mt-4 block max-w-xs rounded-[14px] rounded-tl-[4px] border border-border bg-surface-solid px-3.5 py-2.5 text-sm text-fg shadow-sm">
          ✅ Scale reset to <b>0.0 kg</b>.<br />
          <span className="text-secondary">Tip: only tare when the basket is empty.</span>
        </span>
      </>
    ),
  },
];

function Swatches({ color, onColor }: { color: BasketColor; onColor: (c: BasketColor) => void }) {
  return (
    <div className="mt-6">
      <div role="radiogroup" aria-label="Filament colour" className="flex flex-wrap gap-2.5">
        {BASKET_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={color === c.id}
            aria-label={c.name}
            title={c.name}
            onClick={() => onColor(c.id)}
            className={`size-8 rounded-full border-2 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${color === c.id ? "border-fg" : "border-ink/15"}`}
            style={{ background: c.hex }}
          />
        ))}
      </div>
      <p className="mt-2 font-mono text-[11px] tracking-[0.12em] text-muted uppercase">{colorOf(color).name}</p>
    </div>
  );
}

function StepText({ step, progress, color, onColor, reduce }: { step: Step; progress: MotionValue<number>; color: BasketColor; onColor: (c: BasketColor) => void; reduce: boolean }) {
  const [a, b] = step.at;
  const fade = 0.04;
  // Every input range must stay inside 0..1 and increase: framer hands scroll-linked opacity to the browser's
  // animation engine, which rejects offsets outside that. The first step starts visible, the last ends visible.
  const range = a === 0 ? [0, b - fade / 2, b + fade] : b === 1 ? [a - fade, a + fade / 2, 1] : [a - fade, a + fade / 2, b - fade / 2, b + fade];
  const opacity = useTransform(progress, range, a === 0 ? [1, 1, 0] : b === 1 ? [0, 1, 1] : [0, 1, 1, 0]);
  const y = useTransform(progress, range, a === 0 ? [0, 0, -28] : b === 1 ? [28, 0, 0] : [28, 0, 0, -28]);
  // the steps are stacked; a faded-out one must not swallow taps meant for the visible one (the swatches)
  const pointerEvents = useTransform(opacity, (o) => (o > 0.5 ? "auto" : "none"));
  const place =
    step.side === "center"
      ? "lg:inset-x-0 lg:top-[12%] lg:mx-auto lg:max-w-2xl lg:text-center lg:items-center"
      : step.side === "left"
        ? "lg:inset-x-auto lg:left-[max(2rem,calc((100vw-80rem)/2+2rem))] lg:top-1/2 lg:max-w-md lg:-translate-y-1/2"
        : "lg:inset-x-auto lg:right-[max(2rem,calc((100vw-80rem)/2+2rem))] lg:top-1/2 lg:max-w-md lg:-translate-y-1/2";
  return (
    <motion.div
      style={reduce ? undefined : { opacity, y, pointerEvents }}
      className={`flex flex-col px-5 lg:absolute lg:px-0 ${reduce ? "py-6" : "absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)]"} ${place}`}
    >
      <p className="font-mono text-[11px] tracking-[0.14em] text-accent uppercase">{step.kicker}</p>
      <h3 className="mt-3 text-[clamp(1.8rem,3.6vw,3rem)] leading-[1.05] font-black tracking-tight text-fg">{step.title}</h3>
      <p className="mt-4 text-base leading-relaxed text-secondary lg:text-lg">{step.body}</p>
      {step.swatches && <Swatches color={color} onColor={onColor} />}
    </motion.div>
  );
}

export function BasketShowcase() {
  const [color, onColor] = useBasketColor();
  const runway = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  // Progress through the 520vh runway (0 at its top, 1 at its end). Measured once and on resize, then worked out
  // from the page's scroll position: useScroll({ target }) re-measured the runway on every scroll frame anywhere on
  // the page, forcing a full layout each time other sections had written styles.
  const { scrollY } = useScroll();
  const box = useRef({ top: 0, span: 1 });
  useEffect(() => {
    const el = runway.current;
    if (!el) return;
    const measure = () => {
      box.current = { top: el.getBoundingClientRect().top + window.scrollY, span: Math.max(1, el.offsetHeight - window.innerHeight) };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const scrollYProgress = useTransform(scrollY, (y) => Math.min(1, Math.max(0, (y - box.current.top) / box.current.span)));
  const capable = useCapable3D();
  const [near, setNear] = useState(false);
  const [active, setActive] = useState(false);

  // three.js (~1 MB) starts only once the visitor is actually in this section, never while they read the hero:
  // loading it there froze the first screen. A soft glow holds the place until the model fades in; frames are
  // drawn only while the section is on screen. Phones and budget devices get the photo instead.
  useEffect(() => {
    const el = runway.current;
    if (!el || !capable) return;
    let idle = 0;
    const whenIdle = (fn: () => void) =>
      typeof window.requestIdleCallback === "function" ? (idle = window.requestIdleCallback(fn, { timeout: 600 })) : (idle = window.setTimeout(fn, 200));
    const ahead = new IntersectionObserver(([e]) => e.isIntersecting && whenIdle(() => setNear(true)), { rootMargin: "0px 0px -40% 0px" });
    const onScreen = new IntersectionObserver(([e]) => setActive(e.isIntersecting));
    ahead.observe(el);
    onScreen.observe(el);
    return () => {
      ahead.disconnect();
      onScreen.disconnect();
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
      window.clearTimeout(idle);
    };
  }, [capable]);

  if (reduce) {
    return (
      <section id="basket" aria-label="The Toss basket" className="mx-auto max-w-5xl scroll-mt-24 px-4 py-24">
        <div className="mx-auto max-w-xl">
          <Image src={`/brand/basket/render-angle-${color}.webp`} alt={`The Toss basket box in ${colorOf(color).name}`} width={820} height={482} className="h-auto w-full" />
        </div>
        <div className="mt-10 grid gap-2 lg:grid-cols-2">
          {STEPS.map((s) => (
            <StepText key={s.kicker} step={s} progress={scrollYProgress} color={color} onColor={onColor} reduce />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section ref={runway} id="basket" aria-label="The Toss basket" className="relative h-[520vh]">
      <div className="sticky top-0 h-[100dvh] overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_55%,rgb(var(--accent-rgb)/0.08),transparent_60%)]" />
        <div className="absolute inset-x-0 top-0 h-[58%] lg:inset-0 lg:h-full">
          {!capable ? (
            <BasketPoster color={color} progress={scrollYProgress} />
          ) : near ? (
            <div className="h-full">
              <BasketScene color={colorOf(color).hex} progress={scrollYProgress} active={active} />
            </div>
          ) : (
            <ModelPlaceholder />
          )}
        </div>
        {STEPS.map((s) => (
          <StepText key={s.kicker} step={s} progress={scrollYProgress} color={color} onColor={onColor} reduce={false} />
        ))}
        <ProgressRail progress={scrollYProgress} />
      </div>
    </section>
  );
}

function ProgressRail({ progress }: { progress: MotionValue<number> }) {
  const scaleY = useTransform(progress, [0, 1], [0, 1]);
  return (
    <div aria-hidden className="absolute top-1/2 right-4 hidden h-40 w-px -translate-y-1/2 bg-ink/10 lg:block">
      <motion.div style={{ scaleY }} className="h-full w-px origin-top bg-accent" />
    </div>
  );
}
