"use client";

import { useActionState } from "react";
import { confirmOrderWeight } from "@/lib/actions/manager";
import type { FormState } from "@/lib/actions/shared";

const input =
  "w-28 rounded-[8px] border border-border bg-ink/[0.03] px-3 py-2 font-mono text-sm tabular-nums focus:border-accent/60 focus:outline-none";

// Manager confirms or corrects an unpaid order's weight; the amount is re-priced on save. A laundry that sorts
// whites and coloured clothes corrects each bag (the billed weight is their sum).
export function WeightForm({ orderId, current, bags }: { orderId: string; current: number; bags?: { whites: number; coloured: number } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(confirmOrderWeight, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      {bags ? (
        <>
          <label className="space-y-1 text-xs text-secondary">
            <span className="block">Whites (kg)</span>
            <input name="whites" inputMode="decimal" defaultValue={bags.whites} className={input} />
          </label>
          <label className="space-y-1 text-xs text-secondary">
            <span className="block">Coloured (kg)</span>
            <input name="coloured" inputMode="decimal" defaultValue={bags.coloured} className={input} />
          </label>
        </>
      ) : (
        <>
          <label className="sr-only" htmlFor="kg">
            Weight in kg
          </label>
          <input id="kg" name="kg" inputMode="decimal" defaultValue={current} required className={input} />
        </>
      )}
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
