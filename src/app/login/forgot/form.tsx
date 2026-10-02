"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/lib/actions/password-reset";
import type { FormState } from "@/lib/actions/shared";

const inputClass =
  "w-full rounded-[8px] border border-border bg-ink/[0.03] px-4 py-2.5 text-sm transition-shadow placeholder:text-muted focus:border-accent/60 focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.2)] focus:outline-none";

export function ForgotForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestPasswordReset, {});
  if (state.message) {
    return (
      <p role="status" className="rounded-[8px] border border-good/30 bg-good-bg px-3 py-2 text-sm text-good">
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input name="email" type="email" autoComplete="email" placeholder="Email" required className={inputClass} />
      {state.error && (
        <p role="alert" className="rounded-[8px] border border-critical/30 bg-critical-bg px-3 py-2 text-sm text-critical">
          {state.error}
        </p>
      )}
      <button disabled={pending} className="btn-primary w-full rounded-full px-4 py-3 text-sm font-medium disabled:opacity-70">
        {pending ? "Sending…" : "Email me a reset link"}
      </button>
    </form>
  );
}
