"use client";

import { useActionState } from "react";
import { resetPassword } from "@/lib/actions/password-reset";
import type { FormState } from "@/lib/actions/shared";
import { NewPasswordInput } from "@/components/password-checklist";

const inputClass =
  "w-full rounded-[8px] border border-border bg-ink/[0.03] px-4 py-2.5 text-sm transition-shadow placeholder:text-muted focus:border-accent/60 focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.2)] focus:outline-none";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPassword, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <div>
        <NewPasswordInput name="password" placeholder="New password" label="New password" className={inputClass} />
      </div>
      <input name="confirm" type="password" autoComplete="new-password" placeholder="Repeat new password" minLength={8} maxLength={72} required className={inputClass} />
      {state.error && (
        <p role="alert" className="rounded-[8px] border border-critical/30 bg-critical-bg px-3 py-2 text-sm text-critical">
          {state.error}
        </p>
      )}
      <button disabled={pending} className="btn-primary w-full rounded-full px-4 py-3 text-sm font-medium disabled:opacity-70">
        {pending ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
