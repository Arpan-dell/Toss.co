"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { fieldClass } from "@/components/action-form";
import { askToss, runAiNow } from "@/lib/actions/ai";
import type { FormState } from "@/lib/actions/shared";

export function PendingButton({ children, pendingText, className }: { children: React.ReactNode; pendingText: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={`${className} disabled:opacity-60`}>
      {pending ? pendingText : children}
    </button>
  );
}

export function RunNow({ first = false }: { first?: boolean }) {
  const [state, action] = useActionState<FormState>(runAiNow, {});
  return (
    <form action={action} className="space-y-2">
      <PendingButton
        pendingText="✨ Analysing your business…"
        className={`btn-primary inline-flex items-center gap-2 rounded-full font-medium ${first ? "px-6 py-3 text-base" : "px-4 py-2 text-sm"}`}
      >
        ✨ {first ? "Run my first analysis" : "Re-analyse now"}
      </PendingButton>
      {state.error && <p className="text-xs text-critical">{state.error}</p>}
      {state.message && <p className="text-xs text-good">{state.message}</p>}
    </form>
  );
}

const SUGGESTIONS = ["Which day should I add a driver?", "Who owes me money?", "How do I grow next month?", "Why did orders change?"];

export function AskToss() {
  const [state, action] = useActionState<FormState & { answer?: string; question?: string }, FormData>(askToss, {});
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-3">
      <form action={action} className="flex gap-2">
        <input ref={input} name="question" maxLength={500} placeholder="Ask anything about your business…" className={`${fieldClass} flex-1`} />
        <PendingButton pendingText="Thinking…" className="btn-primary rounded-full px-5 text-sm font-medium">
          Ask
        </PendingButton>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              if (input.current) {
                input.current.value = s;
                input.current.form?.requestSubmit();
              }
            }}
            className="rounded-full border border-border bg-white/[0.03] px-3 py-1 text-xs text-secondary transition hover:border-accent/50 hover:text-fg"
          >
            {s}
          </button>
        ))}
      </div>
      {state.error && <p className="text-sm text-critical">{state.error}</p>}
      {state.answer && (
        <div className="rounded-2xl border border-accent/30 bg-accent/[0.06] p-4">
          <p className="mb-1 text-xs text-muted">You asked: {state.question}</p>
          <p className="text-sm leading-relaxed whitespace-pre-line text-fg">{state.answer}</p>
        </div>
      )}
    </div>
  );
}
