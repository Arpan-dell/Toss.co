"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowRight, EnvelopeSimple, Eye, EyeSlash, LockSimple, Phone, User, type Icon } from "@phosphor-icons/react";
import { signIn, signUp, type AuthState } from "./actions";
import { GoogleButton } from "./google-button";
import { useReducedMotion } from "@/lib/use-reduced-motion";

type Mode = "signin" | "signup";
const EASE = [0.16, 1, 0.3, 1] as const;

// Underlined glass field: icon on the left, an accent line that draws in from the left on focus.
function Field({ icon: I, children, prefix }: { icon: Icon; children: React.ReactNode; prefix?: string }) {
  return (
    <label className="group relative flex items-center gap-3 border-b border-ink/20 py-2.5 transition-colors focus-within:border-transparent">
      <I size={18} className="shrink-0 text-muted transition-colors group-focus-within:text-accent" aria-hidden />
      {prefix && <span className="text-sm text-muted">{prefix}</span>}
      {children}
      <span aria-hidden className="absolute -bottom-px left-0 h-[2px] w-full origin-left scale-x-0 rounded-full bg-accent transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-focus-within:scale-x-100" />
    </label>
  );
}

const inputClass = "w-full min-w-0 bg-transparent text-sm text-fg placeholder:text-muted focus:outline-none";

const PANEL: Record<Mode, { kicker: string; title: string; body: string; cta: string }> = {
  signin: {
    kicker: "New here?",
    title: "Your basket is waiting.",
    body: "Create a Toss account to track pickups, pay invoices by UPI and connect to your laundry.",
    cta: "Create account",
  },
  signup: {
    kicker: "Welcome back!",
    title: "Already a member?",
    body: "Sign in with your credentials to pick up where you left off.",
    cta: "Sign in",
  },
};

// Sign-in / create-account card. Glass over the shard wall: a slanted welcome panel on the left that
// invites you to the other mode, the form on the right. The whole card leans a little toward the pointer.
export function AuthForm({ notice, next, logo }: { notice?: string; next?: string; logo: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [showPw, setShowPw] = useState(false);
  const [inState, inAction, inPending] = useActionState<AuthState, FormData>(signIn, {});
  const [upState, upAction, upPending] = useActionState<AuthState, FormData>(signUp, {});
  const state = mode === "signin" ? inState : upState;
  const pending = inPending || upPending;
  const other: Mode = mode === "signin" ? "signup" : "signin";
  const reduce = useReducedMotion();

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rx = useSpring(useTransform(py, [-0.5, 0.5], [3, -3]), { stiffness: 120, damping: 20 });
  const ry = useSpring(useTransform(px, [-0.5, 0.5], [-4, 4]), { stiffness: 120, damping: 20 });
  const sheenX = useTransform(px, [-0.5, 0.5], ["20%", "80%"]);
  const sheen = useTransform(sheenX, (x) => `radial-gradient(600px circle at ${x} 0%, rgb(255 255 255 / 0.10), transparent 60%)`);

  const swap = (
    <motion.div key={mode} initial={reduce ? false : { opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.45, ease: EASE }}>
      <p className="font-mono text-[11px] tracking-[0.16em] text-accent uppercase">{PANEL[mode].kicker}</p>
      <h2 className="mt-2 text-3xl leading-[1.05] font-black tracking-tight text-fg uppercase md:text-4xl">{PANEL[mode].title}</h2>
      <p className="mt-3 max-w-[30ch] text-sm leading-relaxed text-secondary">{PANEL[mode].body}</p>
      <button
        type="button"
        data-ripple
        onClick={() => setMode(other)}
        className="group mt-6 inline-flex items-center gap-2 rounded-full border border-ink/25 bg-ink/[0.06] px-5 py-2 text-sm font-medium text-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.15)] backdrop-blur-md transition-colors hover:border-accent/50 hover:bg-accent/10"
      >
        {PANEL[mode].cta}
        <ArrowRight size={14} weight="bold" className="transition-transform group-hover:translate-x-1" />
      </button>
    </motion.div>
  );

  return (
    // no filter on this wrapper, even blur(0): any filter on an ancestor stops the card's backdrop-filter from
    // seeing the shard wall behind it, and the glass turns clear
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, ease: EASE }}
      className="w-full max-w-[920px] [perspective:1400px]"
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
        style={reduce ? undefined : { rotateX: rx, rotateY: ry }}
        className="glass-auth relative grid overflow-hidden rounded-[28px] border border-white/15 bg-white/[0.06] shadow-[0_40px_100px_-30px_rgb(0_0_0/0.85),inset_0_1px_0_rgb(255_255_255/0.18)] backdrop-blur-2xl backdrop-saturate-150 md:grid-cols-[0.92fr_1.08fr] light:border-white/70 light:bg-white/40 light:shadow-[0_40px_90px_-30px_rgb(11_20_48/0.45),inset_0_1px_0_rgb(255_255_255/0.9)]"
      >
        {/* pointer-following sheen across the top edge of the glass */}
        <motion.span aria-hidden className="pointer-events-none absolute inset-0 z-0" style={{ background: sheen }} />
        {/* the slanted welcome pane: a second sheet of glass with a lit bevel along its edge */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0 hidden bg-white/[0.05] [clip-path:polygon(0_0,48%_0,42%_100%,0_100%)] md:block light:bg-white/35" />
        <svg aria-hidden className="pointer-events-none absolute inset-0 z-0 hidden size-full md:block" preserveAspectRatio="none" viewBox="0 0 100 100">
          <line x1="48" y1="0" x2="42" y2="100" stroke="url(#bevel)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <defs>
            <linearGradient id="bevel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="white" stopOpacity="0.55" />
              <stop offset="0.6" stopColor="white" stopOpacity="0.12" />
              <stop offset="1" stopColor="white" stopOpacity="0.3" />
            </linearGradient>
          </defs>
        </svg>

        {/* welcome pane */}
        <div className="relative z-10 flex flex-col justify-between gap-10 border-b border-ink/10 px-8 pt-8 pb-6 md:min-h-[540px] md:pb-11 md:border-b-0 md:p-11">
          {logo}
          {/* phones keep it minimal: logo only; the link under the form switches modes */}
          <div className="hidden md:block">
            <AnimatePresence mode="wait" initial={false}>
              {swap}
            </AnimatePresence>
          </div>
          {/* balances the logo so the welcome copy sits in the middle */}
          <span aria-hidden className="hidden h-10 md:block" />
        </div>

        {/* form pane */}
        <div className="relative z-10 p-8 md:p-11">
          <AnimatePresence mode="wait" initial={false}>
            <motion.h1
              key={mode}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="text-2xl font-bold tracking-tight text-fg"
            >
              {mode === "signin" ? "Sign in" : "Create account"}
            </motion.h1>
          </AnimatePresence>
          <p className="mt-1 mb-6 text-sm text-secondary">Track your pickups and pay invoices in one place.</p>

          {notice && !state.error && !state.message && (
            <p className="mb-4 rounded-xl border border-ink/15 bg-ink/[0.05] px-3 py-2 text-sm text-secondary">{notice}</p>
          )}

          <GoogleButton
            next={next}
            className="flex w-full items-center justify-center gap-2.5 rounded-full border border-ink/20 bg-ink/[0.06] px-4 py-3 text-sm font-medium text-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.15)] backdrop-blur-md transition-colors hover:bg-ink/[0.1] disabled:opacity-70"
          />
          <div className="my-5 flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1 bg-gradient-to-r from-transparent to-ink/25" />
            <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">or use email</span>
            <span className="h-px flex-1 bg-gradient-to-l from-transparent to-ink/25" />
          </div>

          <form action={mode === "signin" ? inAction : upAction} className="space-y-2">
            {next && <input type="hidden" name="next" value={next} />}
            <AnimatePresence initial={false}>
              {mode === "signup" && (
                <motion.div
                  key="signup-fields"
                  initial={reduce ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.45, ease: EASE }}
                  className="space-y-2 overflow-hidden"
                >
                  <Field icon={User}>
                    <input name="name" autoComplete="name" placeholder="Full name" aria-label="Full name" required className={inputClass} />
                  </Field>
                  <Field icon={Phone} prefix="+91">
                    <input name="phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="Mobile number" aria-label="Mobile number" required className={inputClass} />
                  </Field>
                </motion.div>
              )}
            </AnimatePresence>
            <Field icon={EnvelopeSimple}>
              <input name="email" type="email" autoComplete="email" placeholder="Email" aria-label="Email" required className={inputClass} />
            </Field>
            <Field icon={LockSimple}>
              <input
                name="password"
                type={showPw ? "text" : "password"}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder={mode === "signin" ? "Password" : "Password (8+ characters)"}
                aria-label="Password"
                minLength={mode === "signup" ? 8 : undefined}
                required
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? "Hide password" : "Show password"}
                aria-pressed={showPw}
                className="shrink-0 text-muted transition-colors hover:text-fg"
              >
                {showPw ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </Field>

            {mode === "signin" && (
              <p className="pt-1 text-right text-xs">
                <Link href="/login/forgot" className="text-secondary hover:text-fg hover:underline">
                  Forgot password?
                </Link>
              </p>
            )}

            {state.error && (
              <p role="alert" className="rounded-xl border border-critical/30 bg-critical-bg px-3 py-2 text-sm text-critical">
                {state.error}
              </p>
            )}
            {state.message && (
              <p role="status" className="rounded-xl border border-good/30 bg-good-bg px-3 py-2 text-sm text-good">
                {state.message}
              </p>
            )}

            <div className="pt-3">
              <button disabled={pending} className="btn-primary w-full rounded-full px-4 py-3 text-sm font-semibold disabled:opacity-70">
                {pending ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </div>
          </form>

          <p className="mt-5 text-center text-xs text-muted">
            {mode === "signin" ? "New to Toss? " : "Already a member? "}
            <button type="button" onClick={() => setMode(other)} className="font-medium text-fg underline-offset-4 hover:text-accent hover:underline">
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
