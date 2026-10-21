"use client";

import { useState } from "react";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import type { FormState } from "@/lib/actions/shared";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

// "Book a pickup" for customers without a Toss basket (or who want one now): an address, now or a time in the
// next week, how many bags, and a note for the driver. The driver weighs it at the door, so no weight is asked.
export function BookPickup({ action, address, business }: { action: Action; address?: string; business: string }) {
  const [later, setLater] = useState(false);
  const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const [min] = useState(() => local(new Date(Date.now() + 60 * 60_000)));
  const [max] = useState(() => local(new Date(Date.now() + 7 * 86_400_000)));
  return (
    <ActionForm action={action} submitLabel="Book pickup">
      <p className="text-sm text-secondary">
        No basket needed. {business} sends a driver, who weighs your clothes at the door; you pay for the weight.
      </p>
      <Field label="Pickup address">
        <textarea name="address" required minLength={6} maxLength={300} rows={2} defaultValue={address} autoComplete="street-address" className={fieldClass} />
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-sm text-secondary">When</legend>
        <div className="flex flex-wrap gap-2">
          {[
            { v: false, label: "As soon as possible" },
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
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <Field label="Bags">
          <select name="bags" defaultValue="1" className={fieldClass}>
            {Array.from({ length: 6 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note for the driver (optional)">
          <input name="notes" maxLength={300} placeholder="Gate code, floor, call when outside…" className={fieldClass} />
        </Field>
      </div>
    </ActionForm>
  );
}

// Residents of a hostel or PG the laundry collects from: pick it once, then join each collection with one tap.
export function HostelPicker({ action, rounds, current, room }: { action: Action; rounds: { id: string; name: string }[]; current?: string | null; room?: string | null }) {
  return (
    <ActionForm action={action} submitLabel="Save">
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <Field label="Your hostel or PG">
          <select name="accountId" defaultValue={current ?? ""} className={fieldClass}>
            <option value="">I don&apos;t live in one of these</option>
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Room">
          <input name="room" maxLength={20} defaultValue={room ?? ""} className={fieldClass} />
        </Field>
      </div>
    </ActionForm>
  );
}
