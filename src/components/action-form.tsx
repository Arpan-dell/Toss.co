"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/actions/shared";

// A form bound to a (prev, formData) server action, with inline success/error feedback.
export function ActionForm({
  action,
  children,
  submitLabel,
  className = "space-y-3",
  submitClassName = "btn-primary rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-70",
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  children: React.ReactNode;
  submitLabel: string;
  className?: string;
  submitClassName?: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  return (
    <form action={formAction} className={className}>
      {children}
      {state.error && (
        <p role="alert" className="rounded-[8px] border border-critical/30 bg-critical-bg px-3 py-2 text-sm text-critical">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="rounded-[8px] border border-good/30 bg-good-bg px-3 py-2 text-sm text-good">
          {state.message}
        </p>
      )}
      <button disabled={pending} className={submitClassName}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

export const fieldClass =
  "w-full rounded-[8px] border border-border bg-ink/[0.03] px-4 py-2.5 text-sm transition-shadow placeholder:text-muted focus:border-accent/60 focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.2)] focus:outline-none";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-secondary">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}
