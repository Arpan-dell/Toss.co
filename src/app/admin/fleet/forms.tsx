"use client";

import { useActionState, useState } from "react";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import type { FormState } from "@/lib/actions/shared";
import { addDriver, updateBasket } from "@/lib/actions/manager-ops";
import type { Device } from "@/lib/types";

export function AddDriverForm() {
  return (
    <ActionForm action={addDriver} submitLabel="Add driver" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field label="Driver name">
        <input name="name" required minLength={2} maxLength={60} placeholder="Vikram" className={fieldClass} />
      </Field>
      <Field label="Telegram chat ID">
        <input name="chatId" required inputMode="numeric" placeholder="e.g. 6100000001" className={`${fieldClass} font-mono`} />
      </Field>
    </ActionForm>
  );
}

// Inline editor for a basket's label, address and target weight.
export function BasketEditor({ device }: { device: Device }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(updateBasket, {});
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-accent hover:text-accent-2">
        Edit
      </button>
    );
  }
  return (
    <form action={action} className="mt-3 space-y-2 border-t border-border pt-3">
      <input type="hidden" name="deviceId" value={device.deviceId} />
      <input name="area" defaultValue={device.area ?? ""} maxLength={60} placeholder="Label, e.g. Saket – Riya" className={fieldClass} />
      <input name="address" defaultValue={device.address ?? ""} maxLength={300} placeholder="Pickup address" className={fieldClass} />
      <input name="targetKg" type="number" step="0.5" min={0.5} max={200} defaultValue={device.targetKg ?? ""} placeholder="Target kg" className={fieldClass} />
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-primary rounded-full px-4 py-1.5 text-xs font-medium disabled:opacity-70">
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted hover:text-fg">
          Close
        </button>
        {state.error && <span className="text-xs text-critical">{state.error}</span>}
        {state.message && <span className="text-xs text-good">{state.message}</span>}
      </div>
      <p className="text-[11px] text-muted">
        The target here is for your records. Customers change the basket&apos;s actual trigger weight from the Telegram bot.
      </p>
    </form>
  );
}
