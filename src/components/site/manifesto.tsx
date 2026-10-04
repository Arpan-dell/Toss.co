"use client";

import { animate, motion, useInView } from "framer-motion";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useEffect, useRef } from "react";

// Split section: the belief on the left, how it shows up on the right. The figures are product facts,
// not marketing stats, and count up once when they scroll into view.
const FACTS = [
  { value: 2, suffix: " taps", label: "to pay any invoice by UPI" },
  { value: 0, suffix: " apps", label: "for drivers to install" },
  { value: 24, suffix: "/7", label: "the basket keeps weighing" },
  { value: 1, suffix: " ID", label: "connects you to your laundry" },
];

function Count({ to, suffix }: { to: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, margin: "-80px" });
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!seen || !ref.current) return;
    if (reduce) {
      ref.current.textContent = `${to}${suffix}`;
      return;
    }
    const c = animate(0, to, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = `${Math.round(v)}${suffix}`;
      },
    });
    return () => c.stop();
  }, [seen, to, suffix, reduce]);
  return <span ref={ref}>{`0${suffix}`}</span>;
}

export function Manifesto() {
  const reduce = useReducedMotion();
  const enter = (d = 0) => ({
    initial: reduce ? false : { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-100px" },
    transition: { duration: 0.8, delay: d, ease: [0.16, 1, 0.3, 1] as const },
  });
  return (
    <div className="relative grid gap-16 lg:grid-cols-[1.15fr_1fr] lg:gap-20">
      <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 size-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/5 blur-[120px]" />
      <motion.h2 {...enter()} className="relative text-[clamp(2.4rem,5vw,4.2rem)] leading-[1.05] font-black tracking-tight">
        Laundry shouldn&apos;t need a calendar. <span className="text-muted">It should just happen.</span>
      </motion.h2>
      <div className="relative">
        <motion.p {...enter(0.1)} className="max-w-[60ch] text-lg leading-relaxed font-light text-secondary">
          Most laundry services still make you book a slot, wait at home and chase a receipt. Toss turns the basket you
          already use into the trigger. It knows when it&apos;s full, the nearest driver gets the job, and you pay from
          your phone.
        </motion.p>
        <dl className="mt-12 grid grid-cols-2 gap-x-8 gap-y-10">
          {FACTS.map((f, i) => (
            <motion.div key={f.label} {...enter(0.15 + i * 0.08)}>
              <dt className="sr-only">{f.label}</dt>
              <dd className="text-5xl font-black tracking-tight text-fg tabular-nums">
                <Count to={f.value} suffix={f.suffix} />
              </dd>
              <dd className="mt-2 text-sm text-muted">{f.label}</dd>
            </motion.div>
          ))}
        </dl>
      </div>
    </div>
  );
}
