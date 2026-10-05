"use client";

import { animate, motion, useInView } from "framer-motion";
import { useEffect, useRef } from "react";
import { Broadcast, ChartLineUp, ClockCountdown, MapPinLine, Receipt, Robot, Truck, Wallet, type Icon } from "@phosphor-icons/react";
import { Reveal } from "./reveal";
import { MainCta } from "./main-cta";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { appHref } from "@/lib/hosts";
import type { PublicPlan } from "@/lib/data";

// What a subscribing laundry manager actually gets, pulled from the shipped feature set (fleet dispatch,
// Toss AI, analytics, invoicing, the public directory) — nothing here is aspirational copy.
const FEATURES: { icon: Icon; title: string; body: string }[] = [
  { icon: Broadcast, title: "Live dispatch board", body: "Every basket, order and driver updates on screen the instant it happens. No refresh button." },
  { icon: Truck, title: "Auto-assigned pickups", body: "The nearest online driver gets the job automatically, with a map route sent straight to Telegram." },
  { icon: Robot, title: "Toss AI, every day", body: "A briefing that forecasts demand, wins back quiet customers and chases unpaid invoices, inside limits you set." },
  { icon: ChartLineUp, title: "Deep analytics", body: "Revenue forecasts, busy-hour heatmaps, churn risk and a driver leaderboard, updated daily." },
  { icon: Receipt, title: "Invoices, automatically", body: "Numbered PDF invoices are generated, emailed and sent on Telegram the moment a payment is confirmed." },
  { icon: MapPinLine, title: "Found by new customers", body: "Your business is listed on Toss's public directory for anyone searching nearby." },
];

const EASE = [0.16, 1, 0.3, 1] as const;

function Count({ to, prefix = "", suffix = "" }: { to: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, margin: "-80px" });
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!seen || !ref.current) return;
    if (reduce) {
      ref.current.textContent = `${prefix}${to.toLocaleString("en-IN")}${suffix}`;
      return;
    }
    const c = animate(0, to, {
      duration: 1.2,
      ease: EASE,
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = `${prefix}${Math.round(v).toLocaleString("en-IN")}${suffix}`;
      },
    });
    return () => c.stop();
  }, [seen, to, prefix, suffix, reduce]);
  return <span ref={ref}>{`${prefix}0${suffix}`}</span>;
}

function FeatureCard({ icon: I, title, body, i }: { icon: Icon; title: string; body: string; i: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 26, scale: 0.94 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay: i * 0.07, ease: EASE }}
      whileHover={reduce ? undefined : { y: -4 }}
      className="group relative overflow-hidden rounded-3xl border border-ink/10 bg-ink/5 p-7 shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] transition-colors hover:border-accent/30"
    >
      <span aria-hidden className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-accent/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
      <motion.span
        whileHover={reduce ? undefined : { scale: 1.12, rotate: -6 }}
        transition={{ type: "spring", stiffness: 300, damping: 15 }}
        className="relative grid size-12 place-items-center rounded-2xl bg-accent/15 text-accent"
      >
        <I size={24} weight="duotone" />
      </motion.span>
      <h3 className="relative mt-5 text-lg font-bold tracking-tight text-fg">{title}</h3>
      <p className="relative mt-2 text-sm leading-relaxed font-light text-secondary">{body}</p>
    </motion.div>
  );
}

// plan is null when the live settings can't be read; the features still show and the card drops the numbers.
export function ManagerPricing({ plan }: { plan: PublicPlan | null }) {
  const reduce = useReducedMotion();
  const tiers = plan
    ? [
        { label: "3+ months", pct: plan.discount3m },
        { label: "6+ months", pct: plan.discount6m },
        { label: "12 months", pct: plan.discount12m },
      ].filter((t) => t.pct > 0)
    : [];

  return (
    <>
      <Reveal as="p" className="font-mono text-[11px] tracking-[0.14em] text-accent uppercase">
        For laundry managers
      </Reveal>
      <Reveal as="h2" delay={0.05} className="mt-3 max-w-3xl text-[clamp(2.4rem,5vw,4.2rem)] leading-[1.05] font-black tracking-tight">
        What your subscription runs.
      </Reveal>
      <Reveal as="p" delay={0.1} className="mt-5 mb-14 max-w-[60ch] text-lg leading-relaxed font-light text-secondary">
        One subscription replaces a booking calendar, a driver dispatcher, an invoice clerk and a spreadsheet of who owes what. Here&apos;s
        everything that turns on.
      </Reveal>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <FeatureCard key={f.title} i={i} {...f} />
        ))}
      </div>

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: EASE }}
        className="relative mt-14 overflow-hidden rounded-3xl border border-accent/25 bg-gradient-to-br from-accent/10 via-ink/5 to-transparent p-8 sm:p-12"
      >
        <span aria-hidden className="pointer-events-none absolute -top-24 -left-24 size-80 rounded-full bg-accent/15 blur-[100px]" />
        <div className="relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              {plan && plan.trialDays > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                  <span className="pulse-ring size-1.5 rounded-full bg-accent" aria-hidden />
                  Free for {plan.trialDays} days
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-ink/5 px-3 py-1 text-xs font-semibold text-secondary">
                <Wallet size={14} />
                0% fee on customer payments
              </span>
            </div>

            {plan && plan.monthlyPrice > 0 ? (
              <>
                <p className="mt-6 text-6xl font-black tracking-tight text-fg tabular-nums sm:text-7xl">
                  <Count to={plan.monthlyPrice} prefix="₹" />
                  <span className="ml-2 align-middle text-xl font-medium text-muted">/month</span>
                </p>
                <p className="mt-2 text-sm text-secondary">{plan.trialDays > 0 ? "after your free trial. " : ""}Paid by UPI, month by month.</p>
              </>
            ) : (
              <p className="mt-6 text-3xl font-black tracking-tight text-fg sm:text-4xl">One simple monthly plan.</p>
            )}

            {tiers.length > 0 && (
              <div className="mt-7 flex flex-wrap gap-2">
                {tiers.map((t) => (
                  <span key={t.label} className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-ink/5 px-3 py-1.5 text-xs text-secondary">
                    <ClockCountdown size={14} className="text-accent" />
                    <span className="font-semibold text-fg">{t.pct}% off</span> paying {t.label} upfront
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* w-fit keeps the glow hugging the button when the grid stacks on mobile */}
          <div className="w-fit">
            <MainCta href={appHref("/login?next=/app/register-business")} glow className="btn-primary shrink-0 rounded-full px-8 py-4 text-base font-semibold">
              Start your free trial
            </MainCta>
          </div>
        </div>
      </motion.div>
    </>
  );
}
