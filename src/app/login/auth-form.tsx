"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

const inputClass =
  "w-full rounded-xl border border-border bg-white/[0.03] px-4 py-2.5 text-sm transition-shadow placeholder:text-muted focus:border-accent/60 focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.2)] focus:outline-none";

export function AuthForm({ notice }: { notice?: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [inState, inAction, inPending] = useActionState<AuthState, FormData>(signIn, {});
  const [upState, upAction, upPending] = useActionState<AuthState, FormData>(signUp, {});
  const state = mode === "signin" ? inState : upState;
  const pending = inPending || upPending;

  return (
    <div className="relative">
      <div className="mb-6 flex gap-1 rounded-full border border-border bg-white/[0.03] p-1 text-sm">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            data-ripple
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={`flex-1 rounded-full px-3 py-1.5 transition-colors ${
              mode === m ? "bg-white/10 font-medium text-fg shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]" : "text-muted hover:text-fg"
            }`}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      {notice && !state.error && !state.message && (
        <p className="mb-4 rounded-xl border border-border bg-white/[0.04] px-3 py-2 text-sm text-secondary">{notice}</p>
      )}

      <form action={mode === "signin" ? inAction : upAction} className="space-y-3">
        {mode === "signup" && (
          <>
            <input name="name" autoComplete="name" placeholder="Full name" required className={inputClass} />
            <div className="flex overflow-hidden rounded-xl border border-border bg-white/[0.03] transition-shadow focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.2)]">
              <span className="flex items-center border-r border-border px-3 text-sm text-muted">+91</span>
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="Mobile number"
                required
                className="w-full bg-transparent px-3 py-2.5 text-sm placeholder:text-muted focus:outline-none"
              />
            </div>
          </>
        )}
        <input name="email" type="email" autoComplete="email" placeholder="Email" required className={inputClass} />
        <input
          name="password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          placeholder={mode === "signin" ? "Password" : "Password (8+ characters)"}
          minLength={mode === "signup" ? 8 : undefined}
          required
          className={inputClass}
        />

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

        <button disabled={pending} className="btn-primary w-full rounded-full px-4 py-3 text-sm font-medium disabled:opacity-70">
          {pending ? "Please wait…" : mode === "signin" ? "Sign in →" : "Create account →"}
        </button>
      </form>
    </div>
  );
}
