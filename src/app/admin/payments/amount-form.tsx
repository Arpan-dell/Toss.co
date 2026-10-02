"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/lib/actions/shared";
import { setOrderAmount } from "@/lib/actions/manager";

// Inline "edit amount" for one order: managers can correct a price (discounts, re-weighs…).
export function AmountForm({ orderId, amount }: { orderId: string; amount: number }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(setOrderAmount, {});

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="text-xs text-accent hover:text-accent-2">
        Edit amount
      </button>
    );
  }
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <span className="text-sm text-muted">₹</span>
      <input
        name="amount"
        type="number"
        min={0}
        step="1"
        defaultValue={amount}
        autoFocus
        className="w-24 rounded-lg border border-border bg-ink/[0.03] px-2 py-1 text-sm tabular-nums focus:border-accent/60 focus:outline-none"
      />
      <button disabled={pending} className="rounded-lg bg-ink/10 px-2.5 py-1 text-xs hover:bg-ink/15 disabled:opacity-60">
        {pending ? "…" : "Save"}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:text-fg">
        Cancel
      </button>
      {state.error && <span className="text-xs text-critical">{state.error}</span>}
      {state.message && <span className="text-xs text-good">✓</span>}
    </form>
  );
}
