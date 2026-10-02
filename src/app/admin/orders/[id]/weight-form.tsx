"use client";

import { useActionState } from "react";
import { confirmOrderWeight } from "@/lib/actions/manager";
import type { FormState } from "@/lib/actions/shared";

// Manager confirms or corrects an unpaid order's weight; the amount is re-priced on save.
export function WeightForm({ orderId, current }: { orderId: string; current: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(confirmOrderWeight, {});
  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <label className="sr-only" htmlFor="kg">
        Weight in kg
      </label>
      <input
        id="kg"
        name="kg"
        inputMode="decimal"
        defaultValue={current}
        required
        className="w-28 rounded-[8px] border border-border bg-ink/[0.03] px-3 py-2 font-mono text-sm tabular-nums focus:border-accent/60 focus:outline-none"
      />
      <button disabled={pending} className="btn-primary rounded-full px-4 py-2 text-sm font-medium disabled:opacity-70">
        {pending ? "Saving…" : "Confirm weight"}
      </button>
      {state.error && (
        <p role="alert" className="basis-full text-sm text-critical">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="basis-full text-sm text-good">
          {state.message}
        </p>
      )}
    </form>
  );
}
