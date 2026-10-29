"use client";

import { useState } from "react";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import type { FormState } from "@/lib/actions/shared";

import { Tr } from "@/components/locale";
// The laundry books a pickup for someone who phoned or messaged: name, number, address, now or a time. If the number
// belongs to a Toss customer of this laundry, it goes on their account; otherwise on the pickup for the driver.
export function NewPickup({ action }: { action: (prev: FormState, fd: FormData) => Promise<FormState> }) {
  const [later, setLater] = useState(false);
  const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const [min] = useState(() => local(new Date(Date.now() + 60 * 60_000)));
  const [max] = useState(() => local(new Date(Date.now() + 7 * 86_400_000)));
  return (
    <ActionForm action={action} submitLabel="Book pickup">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer's name">
          <input name="name" maxLength={80} autoComplete="off" className={fieldClass} />
        </Field>
        <Field label="Mobile number">
          <input name="phone" type="tel" inputMode="tel" required autoComplete="off" className={fieldClass} />
        </Field>
      </div>
      <Field label="Pickup address">
        <textarea name="address" required minLength={6} maxLength={300} rows={2} className={fieldClass} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <fieldset>
          <legend className="mb-1.5 text-sm text-secondary"><Tr>{"When"}</Tr></legend>
          <div className="flex flex-wrap gap-2">
            {[
              { v: false, label: "Now" },
              { v: true, label: "Choose a time" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                aria-pressed={later === o.v}
                onClick={() => setLater(o.v)}
                className={`rounded-full border px-3.5 py-1.5 text-sm ${later === o.v ? "border-accent/60 bg-accent/15 text-accent" : "border-border text-secondary"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {later ? (
            <input type="datetime-local" name="when" required min={min} max={max} defaultValue={min} aria-label="Pickup time" className={`${fieldClass} mt-2`} />
          ) : (
            <input type="hidden" name="when" value="now" />
          )}
        </fieldset>
        <Field label="Bags">
          <select name="bags" defaultValue="1" className={fieldClass}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Note for the driver (optional)">
        <input name="notes" maxLength={300} className={fieldClass} />
      </Field>
    </ActionForm>
  );
}
