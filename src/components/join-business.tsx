"use client";

import { joinBusiness } from "@/lib/actions/customer";
import { ActionForm, fieldClass } from "./action-form";

// Customer enters their laundry's Business ID to connect the two accounts.
export function JoinBusiness({ compact = false }: { compact?: boolean }) {
  return (
    <ActionForm
      action={joinBusiness}
      submitLabel="Connect →"
      className={compact ? "flex flex-col gap-2 sm:flex-row sm:items-start" : "space-y-3"}
      submitClassName="btn-primary shrink-0 rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-70"
    >
      <input
        name="code"
        required
        autoComplete="off"
        placeholder="Business ID, e.g. B-7K2Q9M"
        className={`${fieldClass} font-mono uppercase tracking-wider placeholder:font-sans placeholder:normal-case placeholder:tracking-normal`}
      />
    </ActionForm>
  );
}
