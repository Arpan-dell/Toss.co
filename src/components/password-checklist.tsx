"use client";

import { useState } from "react";
import { CheckCircle, Circle } from "@phosphor-icons/react";
import { PASSWORD_MAX, PASSWORD_RULES } from "@/lib/password-rules";

// The new-password rules as a live checklist: each one ticks as soon as the typed password meets it. The server
// checks the same rules (lib/password-rules.ts), so this only saves a round trip.
export function PasswordChecklist({ value, id }: { value: string; id?: string }) {
  return (
    <ul id={id} aria-live="polite" className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
      {PASSWORD_RULES.map((r) => {
        const ok = r.ok(value);
        return (
          <li key={r.id} className={`flex items-center gap-1.5 ${ok ? "text-good" : "text-muted"}`}>
            {ok ? <CheckCircle size={14} weight="fill" aria-hidden /> : <Circle size={14} aria-hidden />}
            <span>
              {r.label}
              <span className="sr-only">{ok ? " (done)" : " (missing)"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** A new-password input with the checklist under it. */
export function NewPasswordInput({ name, className, placeholder, label, defaultValue = "" }: { name: string; className: string; placeholder?: string; label?: string; defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);
  const hint = `${name}-rules`;
  return (
    <>
      <input
        name={name}
        type="password"
        autoComplete="new-password"
        required
        maxLength={PASSWORD_MAX}
        placeholder={placeholder}
        aria-label={label}
        aria-describedby={hint}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={className}
      />
      <PasswordChecklist value={value} id={hint} />
    </>
  );
}
