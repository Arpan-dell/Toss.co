"use client";

import Image from "next/image";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { Basket, ChartLineUp, Sparkle, Truck, type Icon } from "@phosphor-icons/react";

// Who Toss is for, as a 4-cell bento. Each card tilts toward the pointer in 3D (spring-damped motion
// values, so no re-renders) and carries its icon in a quarter-circle in the corner.

function TiltCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rx = useSpring(useTransform(py, [-0.5, 0.5], [7, -7]), { stiffness: 150, damping: 18 });
  const ry = useSpring(useTransform(px, [-0.5, 0.5], [-9, 9]), { stiffness: 150, damping: 18 });
  const glowX = useTransform(px, (v) => `${(v + 0.5) * 100}%`);
  const glowY = useTransform(py, (v) => `${(v + 0.5) * 100}%`);
  const glow = useTransform([glowX, glowY], ([x, y]) => `radial-gradient(420px circle at ${x} ${y}, rgb(var(--accent-rgb) / 0.12), transparent 50%)`);
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className={`[perspective:1200px] ${className}`}
    >
      <motion.div
        onPointerMove={(e) => {
          if (reduce) return;
          const r = e.currentTarget.getBoundingClientRect();
          px.set((e.clientX - r.left) / r.width - 0.5);
          py.set((e.clientY - r.top) / r.height - 0.5);
        }}
        onPointerLeave={() => {
          px.set(0);
          py.set(0);
        }}
        style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
        className="group relative h-full overflow-hidden rounded-3xl border border-ink/10 bg-ink/5 shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] backdrop-blur-md"
      >
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{ background: glow }}
        />
        {children}
      </motion.div>
    </motion.div>
  );
}

function Corner({ icon: I }: { icon: Icon }) {
  return (
    <span aria-hidden className="absolute top-0 right-0 z-20 grid size-28 place-items-center rounded-bl-full bg-ink/[0.06] pb-6 pl-6 text-accent [transform:translateZ(40px)]">
      <I size={34} weight="duotone" />
    </span>
  );
}

function Copy({ title, body }: { title: string; body: string }) {
  return (
    <div className="relative z-20 [transform:translateZ(30px)]">
      <h3 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">{title}</h3>
      <p className="mt-3 max-w-md leading-relaxed font-light text-secondary">{body}</p>
    </div>
  );
}

export function RolesBento() {
  return (
    <div className="grid auto-rows-[minmax(260px,auto)] gap-5 lg:grid-cols-3">
      <TiltCard className="lg:col-span-2">
        <Image src="/brand/site/hero-real.webp" alt="" fill sizes="(min-width: 1024px) 66vw, 100vw" className="object-cover object-[60%_70%] opacity-45 transition-transform duration-1000 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/60 to-transparent" />
        <Corner icon={Basket} />
        <div className="relative flex h-full flex-col justify-end p-8 sm:p-10">
          <p className="mb-3 text-xs font-bold tracking-widest text-accent uppercase">Customers</p>
          <Copy title="Never book a pickup again" body="The basket weighs itself and calls a driver when it's full. Follow the pickup on Telegram, then pay in two taps." />
        </div>
      </TiltCard>

      <TiltCard className="lg:row-span-2">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_70%_at_100%_0%,rgb(0_180_255/0.28),transparent_60%),radial-gradient(90%_60%_at_0%_100%,rgb(var(--accent-rgb)/0.2),transparent_60%)]" />
        <Corner icon={Truck} />
        <div className="relative flex h-full flex-col justify-between gap-10 p-8 sm:p-10">
          <p className="text-xs font-bold tracking-widest text-accent uppercase">Drivers</p>
          <div className="space-y-5 [transform:translateZ(20px)]">
            {["Nearest pickup first", "One route, ending at the store", "Tap Picked up, done"].map((t, i) => (
              <div key={t} className="flex items-center gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-full border border-ink/15 font-mono text-sm text-fg">{i + 1}</span>
                <span className="text-secondary">{t}</span>
              </div>
            ))}
          </div>
          <Copy title="Jobs that come to you" body="Pickups arrive in Telegram with a map and the customer's details. No app to install." />
        </div>
      </TiltCard>

      <TiltCard>
        <div aria-hidden className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgb(255_255_255)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255)_1px,transparent_1px)] [background-size:28px_28px]" />
        <Corner icon={ChartLineUp} />
        <div className="relative flex h-full flex-col justify-end p-8">
          <p className="mb-3 text-xs font-bold tracking-widest text-accent uppercase">Laundries</p>
          <Copy title="Your whole city, live" body="Every basket, driver and invoice on one board. Confirm UPI payments with a tap." />
        </div>
      </TiltCard>

      <TiltCard>
        <div aria-hidden className="absolute -right-16 -bottom-16 size-64 rounded-full bg-accent/15 blur-3xl" />
        <Corner icon={Sparkle} />
        <div className="relative flex h-full flex-col justify-end p-8">
          <p className="mb-3 text-xs font-bold tracking-widest text-accent uppercase">Toss AI</p>
          <Copy title="A briefing that acts" body="Forecasts busy days, wins back quiet customers and chases unpaid invoices, within limits you set." />
        </div>
      </TiltCard>
    </div>
  );
}
