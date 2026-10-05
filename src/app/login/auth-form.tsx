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
      <span
        aria-hidden
        className="absolute -bottom-px left-0 h-[2px] w-full origin-left scale-x-0 rounded-full bg-accent transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-focus-within:scale-x-100"
      />
    </label>
  );
}

const inputClass = "w-full min-w-0 bg-transparent text-sm text-fg placeholder:text-muted focus:outline-none";
const ghostButton =
  "group inline-flex items-center gap-2 rounded-full border border-ink/25 bg-ink/[0.06] px-5 py-2 text-sm font-medium text-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.15)] backdrop-blur-md transition-colors hover:border-accent/50 hover:bg-accent/10";

// The welcome pane sits opposite the form and invites you to the other mode.
const WELCOME: Record<Mode, { title: string; body: string; cta: string }> = {
  signin: { title: "Hello, friend!", body: "New to Toss? Create an account to track pickups, pay by UPI and connect to your laundry.", cta: "Create account" },
  signup: { title: "Welcome back!", body: "Already a member? Sign in with your credentials to pick up where you left off.", cta: "Sign in" },
};

// Sign-in / create-account card, after the "glassy login" reference: one sheet of glass split by a slanted bevel,
// the form on one side and a welcome pane on the other. Switching modes swaps the sides: the two halves glide past
// each other while the slanted pane and its bevel sweep across, and the text in each half cross-fades.
export function AuthForm({ notice, next, logo }: { notice?: string; next?: string; logo: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [showPw, setShowPw] = useState(false);
  const [inState, inAction, inPending] = useActionState<AuthState, FormData>(signIn, {});
  const [upState, upAction, upPending] = useActionState<AuthState, FormData>(signUp, {});
  const state = mode === "signin" ? inState : upState;
  const pending = inPending || upPending;
  const other: Mode = mode === "signin" ? "signup" : "signin";
  const reduce = useReducedMotion();

  // the card leans a little toward the pointer, and a sheen follows it across the top edge
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rx = useSpring(useTransform(py, [-0.5, 0.5], [3, -3]), { stiffness: 120, damping: 20 });
  const ry = useSpring(useTransform(px, [-0.5, 0.5], [-4, 4]), { stiffness: 120, damping: 20 });
  const sheenX = useTransform(px, [-0.5, 0.5], ["20%", "80%"]);
  const sheen = useTransform(sheenX, (x) => `radial-gradient(600px circle at ${x} 0%, rgb(255 255 255 / 0.10), transparent 60%)`);

  const signin = mode === "signin";

  // contents of each half cross-fade (quickly, so they're gone before the halves pass each other)
  const fade = {
    initial: reduce ? false : ({ opacity: 0, y: 8 } as const),
    animate: { opacity: 1, y: 0, transition: { duration: 0.32, delay: 0.3, ease: EASE } },
    exit: { opacity: 0, y: -6, transition: { duration: 0.16, ease: "easeIn" as const } },
  };

  const form = (
    <motion.div key={`form-${mode}`} {...fade} className="flex flex-col justify-center">
      <h1 className="text-2xl font-bold tracking-tight text-fg">{signin ? "Sign in" : "Create account"}</h1>
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

      <form action={signin ? inAction : upAction} className="space-y-2">
        {next && <input type="hidden" name="next" value={next} />}
        {!signin && (
          <>
            <Field icon={User}>
              <input name="name" autoComplete="name" placeholder="Full name" aria-label="Full name" required className={inputClass} />
            </Field>
            <Field icon={Phone} prefix="+91">
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="Mobile number"
                aria-label="Mobile number"
                required
                className={inputClass}
              />
            </Field>
          </>
        )}
        <Field icon={EnvelopeSimple}>
          <input name="email" type="email" autoComplete="email" placeholder="Email" aria-label="Email" required className={inputClass} />
        </Field>
        <Field icon={LockSimple}>
          <input
            name="password"
            type={showPw ? "text" : "password"}
            autoComplete={signin ? "current-password" : "new-password"}
            placeholder={signin ? "Password" : "Password (8+ characters)"}
            aria-label="Password"
            minLength={signin ? undefined : 8}
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

        {signin && (
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
            {pending ? "Please wait…" : signin ? "Sign in" : "Create account"}
          </button>
        </div>
      </form>

      <p className="mt-5 text-center text-xs text-muted">
        {signin ? "New to Toss? " : "Already a member? "}
        <button type="button" onClick={() => setMode(other)} className="font-medium text-fg underline-offset-4 hover:text-accent hover:underline">
          {signin ? "Create an account" : "Sign in"}
        </button>
      </p>
    </motion.div>
  );

  const welcome = (
    <motion.div key={`welcome-${mode}`} {...fade} className="flex h-full flex-col justify-between">
      <div className={signin ? "self-end" : ""}>{logo}</div>
      <div className={signin ? "text-right" : ""}>
        <h2 className="text-4xl leading-[1.02] font-black tracking-tight text-fg uppercase">{WELCOME[mode].title}</h2>
        <p className={`mt-3 max-w-[30ch] text-sm leading-relaxed text-secondary ${signin ? "ml-auto" : ""}`}>{WELCOME[mode].body}</p>
        <button type="button" data-ripple onClick={() => setMode(other)} className={`${ghostButton} mt-6`}>
          {WELCOME[mode].cta}
          <ArrowRight size={14} weight="bold" className="transition-transform group-hover:translate-x-1" />
        </button>
      </div>
      <span aria-hidden className="h-10" />
    </motion.div>
  );

  // the welcome pane's own sheet of glass, slanted along the bevel; mirrored when it moves to the right
  const pane = signin ? "polygon(52% 0, 100% 0, 100% 100%, 58% 100%)" : "polygon(0 0, 48% 0, 42% 100%, 0 100%)";
  const bevel = signin ? { x1: 52, x2: 58 } : { x1: 48, x2: 42 };
  const swap = reduce ? { duration: 0 } : { duration: 0.75, ease: [0.65, 0, 0.35, 1] as const };

  return (
    // no filter on this wrapper, even blur(0): any filter on an ancestor stops the card's backdrop-filter from
    // seeing the backdrop behind it, and the glass turns clear
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
        className="glass-auth relative overflow-hidden rounded-[28px] border border-white/15 bg-white/[0.06] shadow-[0_40px_100px_-30px_rgb(0_0_0/0.85),inset_0_1px_0_rgb(255_255_255/0.18)] backdrop-blur-[10px] backdrop-saturate-150 light:border-white/70 light:bg-white/40 light:shadow-[0_40px_90px_-30px_rgb(11_20_48/0.45),inset_0_1px_0_rgb(255_255_255/0.9)]"
      >
        <motion.span aria-hidden className="pointer-events-none absolute inset-0 z-0" style={{ background: sheen }} />

        {/* The swap: the two halves glide past each other (a layout animation, transforms only), the slanted
            glass pane and its bevel sweep across with them, and only the text inside each half cross-fades. */}
        <div className="relative grid md:min-h-[560px] md:grid-cols-2">
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 hidden bg-white/[0.05] md:block light:bg-white/35"
            initial={false}
            animate={{ clipPath: pane }}
            transition={swap}
          />
          <svg aria-hidden className="pointer-events-none absolute inset-0 z-0 hidden size-full md:block" preserveAspectRatio="none" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="bevel" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="white" stopOpacity="0.55" />
                <stop offset="0.6" stopColor="white" stopOpacity="0.12" />
                <stop offset="1" stopColor="white" stopOpacity="0.3" />
              </linearGradient>
            </defs>
            <motion.line
              initial={false}
              animate={{ x1: bevel.x1, x2: bevel.x2 }}
              transition={swap}
              y1="0"
              y2="100"
              stroke="url(#bevel)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <motion.div layout="position" transition={swap} className="relative z-10 p-8 md:p-11" style={{ order: signin ? 0 : 1 }}>
            <AnimatePresence mode="wait" initial={false}>
              {form}
            </AnimatePresence>
          </motion.div>
          {/* phones keep it minimal: the welcome half is desktop-only, the link under the form switches modes */}
          <motion.div layout="position" transition={swap} className="relative z-10 hidden p-11 md:block" style={{ order: signin ? 1 : 0 }}>
            <AnimatePresence mode="wait" initial={false}>
              {welcome}
            </AnimatePresence>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
