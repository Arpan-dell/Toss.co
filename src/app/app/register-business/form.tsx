"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionForm, Field, fieldClass } from "@/components/action-form";
import { registerBusiness } from "@/lib/actions/customer";
import { METHOD_LABEL } from "@/lib/pay-methods";
import { COUNTRIES, CURRENCIES, OTHER_COUNTRY, countryOf, type WeightUnit } from "@/lib/regions";

// Where the business is decides its currency, kg or lb, time zone and how customers pay. The country is guessed
// from where the visitor is; everything can be changed here or later in Settings.
export function RegisterBusinessForm({ detected }: { detected: string }) {
  const [country, setCountry] = useState(detected);
  const c = countryOf(country);
  const [currency, setCurrency] = useState(c.currency);
  const [unit, setUnit] = useState<WeightUnit>(c.unit);
  const india = c.code === "IN";
  // the browser knows its own time zone; fall back to the country's usual one
  const [timezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
      return "";
    }
  });
  const examples = c.methods
    .filter((m) => m !== "cash")
    .slice(0, 3)
    .map((m) => METHOD_LABEL[m])
    .join(", ");

  return (
    <ActionForm action={registerBusiness} submitLabel="Create my business →">
      <Field label="Business name">
        <input name="name" required minLength={2} maxLength={80} placeholder="Fresh Fold Laundry" className={fieldClass} />
      </Field>
      <Field label="Country" hint="Sets your currency, weight unit, time zone and how customers can pay you.">
        <select
          name="country"
          value={country}
          onChange={(e) => {
            const next = countryOf(e.target.value);
            setCountry(e.target.value);
            setCurrency(next.currency);
            setUnit(next.unit);
          }}
          className={fieldClass}
        >
          {[...COUNTRIES]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((x) => (
              <option key={x.code} value={x.code}>
                {x.name}
              </option>
            ))}
          {!COUNTRIES.some((x) => x.code === country) && <option value={country}>{OTHER_COUNTRY.name}</option>}
        </select>
      </Field>
      <input type="hidden" name="timezone" value={timezone || c.timezone} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Currency">
          <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={fieldClass}>
            {CURRENCIES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <fieldset>
          <legend className="mb-1.5 block text-sm text-secondary">Weigh in</legend>
          <div className="flex gap-2">
            {(["kg", "lb"] as const).map((u) => (
              <label
                key={u}
                className={`flex-1 cursor-pointer rounded-[8px] border px-3 py-2.5 text-center text-sm ${unit === u ? "border-accent/60 bg-accent/10 text-fg" : "border-border text-secondary"}`}
              >
                <input type="radio" name="unit" value={u} checked={unit === u} onChange={() => setUnit(u)} className="sr-only" />
                {u === "kg" ? "Kilograms (kg)" : "Pounds (lb)"}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <Field label={`Price per ${unit} (${currency})`} hint="Applies to every pickup. You can change it anytime.">
        <input
          key={`${currency}-${unit}`}
          name="price"
          type="number"
          required
          min={0.01}
          max={10000}
          step="0.01"
          defaultValue={india ? 80 : unit === "lb" ? 1.99 : 4}
          className={fieldClass}
        />
      </Field>
      {india ? (
        <>
          <Field label="UPI ID for customer payments" hint="Customers' payments go straight to this UPI ID. You can change it anytime.">
            <input name="upiId" required autoComplete="off" placeholder="yourshop@okaxis" className={`${fieldClass} font-mono`} />
          </Field>
          <Field label="Name shown in UPI apps (optional)">
            <input name="upiName" maxLength={50} placeholder="Same as business name" className={fieldClass} />
          </Field>
        </>
      ) : (
        <p className="rounded-[8px] border border-border bg-ink/[0.03] px-3 py-2.5 text-sm text-secondary">
          Next you&apos;ll choose how customers pay you, for example {examples}. Money goes straight to you; Toss takes no fees. Cash works
          from day one.
        </p>
      )}
      <label className="flex items-start gap-2.5 text-sm text-secondary">
        <input type="checkbox" name="consent" value="yes" required className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" />
        <span>
          I agree to the{" "}
          <Link href="/terms" className="text-fg underline underline-offset-2">
            Terms of Service
          </Link>{" "}
          (including the part for laundries) and will use customers&apos; details only to serve them, as the{" "}
          <Link href="/privacy" className="text-fg underline underline-offset-2">
            Privacy Policy
          </Link>{" "}
          explains.
        </span>
      </label>
    </ActionForm>
  );
}
