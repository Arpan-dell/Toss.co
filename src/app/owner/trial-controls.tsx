"use client";

import { useActionState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { endTrial, extendTrial } from "@/lib/actions/owner";
import type { FormState } from "@/lib/actions/shared";

// Per-business trial controls on the owner's Businesses table: add days, or end the trial now (with a confirm step).
export function TrialControls({ tenantId, business, onTrial }: { tenantId: string; business: string; onTrial: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(extendTrial, {});
  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <form action={action} className="flex items-center gap-1.5">
          <input type="hidden" name="tenantId" value={tenantId} />
          <label className="sr-only" htmlFor={`days-${tenantId}`}>
            Days to add to {business}&apos;s trial
          </label>
          <input
            id={`days-${tenantId}`}
            name="days"
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            defaultValue={7}
            required
            className="w-14 rounded-[6px] border border-border bg-ink/[0.03] px-2 py-1 text-xs tabular-nums"
          />
          <button disabled={pending} className="text-xs whitespace-nowrap text-accent hover:underline disabled:opacity-60">
            {pending ? "Saving…" : onTrial ? "Extend trial" : "Give trial days"}
          </button>
        </form>
        {onTrial && (
          <ConfirmButton
            action={endTrial}
            fields={{ tenantId }}
            label="End trial now"
            confirm={`End ${business}'s trial now? They move to Toss Free straight away and get an email.`}
          />
        )}
      </div>
      {state.error && (
        <p role="alert" className="text-xs text-critical">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-xs text-good">
          {state.message}
        </p>
      )}
    </div>
  );
}
