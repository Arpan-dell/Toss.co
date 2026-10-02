"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import type { FormState } from "@/lib/actions/shared";
import { Badge } from "@/components/ui";
import { addDriver, setDriverStatus, updateBasket } from "@/lib/actions/manager-ops";
import type { Device, DriverStatus } from "@/lib/types";

const STATUS: Record<DriverStatus, { tone: "good" | "info" | "neutral"; label: string; live?: boolean }> = {
  AVAILABLE: { tone: "good", label: "Available", live: true },
  ON_JOB: { tone: "info", label: "On a job" },
  OFFLINE: { tone: "neutral", label: "Offline" },
};

// Driver status switch. The tag changes the moment you pick a status; the save runs behind it and the tag
// falls back (with a note) if it fails.
export function DriverStatusControl({ driverId, name, status }: { driverId: string; name: string; status: DriverStatus }) {
  const [shown, setShown] = useOptimistic(status);
  const [, start] = useTransition();
  const [error, setError] = useState<string>();
  const s = STATUS[shown];
  return (
    <div className="flex items-center gap-2">
      <Badge tone={s.tone} live={s.live}>{s.label}</Badge>
      <select
        value={shown}
        aria-label={`Change ${name}'s status`}
        onChange={(e) => {
          const next = e.target.value as DriverStatus;
          start(async () => {
            setError(undefined);
            setShown(next);
            const fd = new FormData();
            fd.set("driverId", driverId);
            fd.set("status", next);
            try {
              await setDriverStatus(fd);
            } catch {
              setError("Not saved");
            }
          });
        }}
        className="rounded-[6px] border border-border bg-surface-solid px-2 py-1 text-xs"
      >
        <option value="AVAILABLE">Available</option>
        <option value="ON_JOB">On a job</option>
        <option value="OFFLINE">Offline</option>
      </select>
      {error && <span role="alert" className="text-xs text-critical">{error}</span>}
    </div>
  );
}

export function AddDriverForm() {
  return (
    <ActionForm action={addDriver} submitLabel="Add driver" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field label="Driver name">
        <input name="name" required minLength={2} maxLength={60} placeholder="Vikram" className={fieldClass} />
      </Field>
      <Field label="Mobile number">
        <input name="phone" type="tel" inputMode="tel" required placeholder="98765 43210" className={fieldClass} />
      </Field>
    </ActionForm>
  );
}

// Inline editor for a basket's label, address and target weight. Takes only the fields it edits, so the
// owner's Telegram ID and other basket internals never reach the browser.
export type EditableBasket = Pick<Device, "deviceId" | "area" | "address" | "targetKg">;
export function BasketEditor({ device }: { device: EditableBasket }) {
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
